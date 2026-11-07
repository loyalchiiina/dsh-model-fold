// dsh-model-fold — host side
//
// The UI is client-side (lib/client.js). This host half provides two small
// local routes:
//   POST /plugin/dsh-model-fold/probe          — one-token chat probe
//   GET  /plugin/dsh-model-fold/probe-results  — read persisted probe results
//   POST /plugin/dsh-model-fold/probe-results  — write persisted probe results
// It never persists anything else and never exposes credentials.
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

export const name = "dsh-model-fold";
export const inject = [];

const PROBE_PATH = "/plugin/dsh-model-fold/probe";
const RESULTS_PATH = "/plugin/dsh-model-fold/probe-results";
const MAX_BODY = 16 * 1024;
const MAX_RESULTS_BODY = 1024 * 1024;
const TIMEOUT_MS = 12000;
const RESULTS_FILE = path.join(
  process.env.DSH_HOME || path.join(os.homedir(), ".dsh"),
  "model-fold-probe.json",
);

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > (maxBytes || MAX_BODY)) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function postJson(url, headers, payload) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      resolve({ status: 0, error: "invalid baseURL" });
      return;
    }
    const transport = target.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (text.length < 4096) text += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body: text.slice(0, 2000) });
        });
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ status: 0, error: String(error && error.message || error) }));
    req.write(body);
    req.end();
  });
}

function endpointOf(baseURL, api) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  if (api === "anthropic-messages") return base + "/messages";
  if (api === "openai-responses") return base + "/responses";
  return base + "/chat/completions";
}

function payloadOf(model, api) {
  if (api === "anthropic-messages") {
    return { model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] };
  }
  if (api === "openai-responses") {
    return { model, input: "ping", max_output_tokens: 1 };
  }
  return { model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false };
}

function headersOf(api, apiKey) {
  const headers = {};
  if (!apiKey) return headers;
  if (api === "anthropic-messages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.authorization = "Bearer " + apiKey;
  }
  return headers;
}

async function readResults() {
  try {
    const text = await fs.readFile(RESULTS_FILE, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && parsed.results && typeof parsed.results === "object"
      ? parsed.results
      : {};
  } catch {
    return {};
  }
}

async function writeResults(results) {
  const text = JSON.stringify({ version: 1, updatedAt: Date.now(), results }, null, 2);
  if (text.length > MAX_RESULTS_BODY) return false;
  const dir = path.dirname(RESULTS_FILE);
  const tmp = RESULTS_FILE + ".tmp";
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, text, "utf8");
    await fs.rename(tmp, RESULTS_FILE);
    return true;
  } catch {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    return false;
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function handleProbe(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "POST required" });
    return;
  }
  try {
    const raw = await readBody(req, MAX_BODY);
    const input = JSON.parse(raw || "{}");
    const model = String(input.model || "").trim();
    const baseURL = String(input.baseURL || "").trim();
    const api = String(input.api || "openai-completions");
    if (!model || !baseURL) {
      sendJson(res, 400, { ok: false, error: "model and baseURL required" });
      return;
    }
    const envKey = input.apiKeyEnv ? process.env[String(input.apiKeyEnv)] : "";
    const apiKey = envKey || input.apiKey || "";
    const result = await postJson(
      endpointOf(baseURL, api),
      headersOf(api, apiKey),
      payloadOf(model, api),
    );
    if (result.error) {
      sendJson(res, 200, { ok: false, status: 0, code: "NETWORK", message: result.error });
      return;
    }
    const status = result.status || 0;
    const ok = status >= 200 && status < 300;
    let message = "";
    if (!ok) {
      try {
        const parsed = JSON.parse(result.body || "{}");
        message = String(parsed.error?.message || parsed.error || parsed.message || result.body || "").slice(0, 300);
      } catch {
        message = String(result.body || "").slice(0, 300);
      }
    }
    sendJson(res, 200, { ok, status, code: ok ? "OK" : "HTTP_" + status, message });
  } catch (error) {
    sendJson(res, 500, { ok: false, status: 0, code: "EXCEPTION", message: String(error && error.message || error) });
  }
}

async function handleResults(req, res) {
  if (req.method === "GET") {
    const results = await readResults();
    sendJson(res, 200, { ok: true, results });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "GET or POST required" });
    return;
  }
  try {
    const raw = await readBody(req, MAX_RESULTS_BODY);
    const body = JSON.parse(raw || "{}");
    const results = body && body.results;
    if (!results || typeof results !== "object" || Array.isArray(results)) {
      sendJson(res, 400, { ok: false, error: "results object required" });
      return;
    }
    const saved = await writeResults(results);
    sendJson(res, saved ? 200 : 500, saved ? { ok: true } : { ok: false, error: "write failed" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error && error.message || error) });
  }
}

export function apply(ctx) {
  ctx.logger.info("dsh-model-fold: started (client-side model-menu folding + probe routes)");
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => {
      const disposeProbe = webCtx.webServer.register({
        kind: "exact",
        path: PROBE_PATH,
        handler: handleProbe,
      });
      const disposeResults = webCtx.webServer.register({
        kind: "exact",
        path: RESULTS_PATH,
        handler: handleResults,
      });
      return () => {
        disposeProbe();
        disposeResults();
      };
    }, "dsh-model-fold: probe routes");
  });
}

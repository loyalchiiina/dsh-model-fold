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

// Node 的 http.request 对码点 > 0xFF 的头值会**同步**抛 ERR_INVALID_CHAR；
// 这不是网络错误，而是该候选凭据本身不可用，应当换下一把而不是判整次失败。
function isInvalidHeaderError(error) {
  if (!error) return false;
  if (error.code === "ERR_INVALID_CHAR") return true;
  return /invalid character in header/i.test(String(error.message || ""));
}

function credentialsServiceOf(ctx) {
  if (!ctx || typeof ctx.get !== "function") return undefined;
  let service;
  try {
    service = ctx.get("credentials");
  } catch {
    service = undefined;
  }
  return service && typeof service.resolve === "function" ? service : undefined;
}

async function resolveFromCredentialsService(ctx, ref) {
  const service = credentialsServiceOf(ctx);
  if (!service || !ref) return undefined;
  try {
    const resolved = await service.resolve(ref);
    const value = resolved && resolved.value ? String(resolved.value) : "";
    // Keep the service path consistent with the document reader: a template
    // reference or an encrypted blob is not a usable credential.
    if (/^\$\{|^\{\{|^enc1:/i.test(value)) return undefined;
    if (!value) return undefined;
    return { value, source: "credentials/" + String(resolved.source || "unknown") };
  } catch {
    return undefined;
  }
}

// Fallback for a host whose credentials service predates this plugin: the
// managed document stores the refs section as plain text.
async function resolveFromCredentialsDocument(ref) {
  if (!ref) return undefined;
  try {
    const file = path.join(path.dirname(RESULTS_FILE), ".credentials.yaml");
    const text = await fs.readFile(file, "utf8");
    let inRefs = false;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (/^refs:\s*(#.*)?$/.test(line)) {
        inRefs = true;
        continue;
      }
      if (!/^\s/.test(line)) {
        inRefs = false;
        continue;
      }
      if (!inRefs) continue;
      const match = /^\s+([^\s:#]+)\s*:\s*(.*)$/.exec(line);
      if (!match || match[1] !== ref) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value || value.startsWith("enc1:") || value.startsWith("${") || value.startsWith("{{")) {
        return undefined;
      }
      return { value, source: "credentials/file-raw" };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// Ordered by authority. The managed credentials file wins over the process
// environment: the Models page only ever writes that file, while a stale
// inherited variable may still hold a key the gateway already revoked.
async function collectKeyCandidates(ctx, input) {
  const envName = input && input.apiKeyEnv ? String(input.apiKeyEnv) : "";
  const directKey = input && input.apiKey ? String(input.apiKey).trim() : "";
  const seen = new Set();
  const candidates = [];
  const add = (value, source) => {
    const key = String(value || "").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ value: key, source });
  };
  const serviceAvailable = Boolean(credentialsServiceOf(ctx));
  let envSourced;
  if (envName) {
    const managed = await resolveFromCredentialsService(ctx, envName);
    if (managed) {
      // A value the service inherited from the environment is only one step
      // above process.env, so it must not outrank a key typed into the panel.
      if (/env/i.test(String(managed.source || ""))) envSourced = managed;
      else add(managed.value, managed.source);
    }
    // The service reads the managed document itself, so a direct read is only a
    // fallback for hosts whose credentials plugin predates this one. Reading it
    // anyway would duplicate the parse on every probe and could disagree with it.
    if (!serviceAvailable) {
      const document = await resolveFromCredentialsDocument(envName);
      if (document) {
        add(document.value, document.source);
      }
    }
  }
  add(directKey, "request");
  if (envSourced) add(envSourced.value, envSourced.source);
  if (envName) add(process.env[envName], "process-env");
  if (!candidates.length) candidates.push({ value: "", source: "none" });
  return candidates;
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

async function handleProbe(ctx, req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "POST required" });
    return;
  }
  let candidates = [];
  let keySource = "none";
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
    candidates = await collectKeyCandidates(ctx, input);
    // { value: "", source: "none" } is a marker for "there is nothing to try",
    // not a credential. Sending it would probe anonymously, get a 401, and
    // surface that 401 as "your key was rejected" — the panel would then blame
    // the user for a key this plugin itself dropped.
    if (candidates.length === 1 && !candidates[0].value) {
      sendJson(res, 200, {
        ok: false,
        status: 0,
        code: "NO_CREDENTIAL",
        message: "未找到可用凭据（凭据库、请求与环境变量均为空）",
        keySource: "none",
      });
      return;
    }
    let result;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      keySource = candidate.source;
      try {
        result = await postJson(
          endpointOf(baseURL, api),
          headersOf(api, candidate.value),
          payloadOf(model, api),
        );
      } catch (headerError) {
        if (!isInvalidHeaderError(headerError)) throw headerError;
        result = {
          status: 0,
          code: "INVALID_KEY_CHAR",
          error: "该来源凭据含 http 头不允许的字符，不可用",
        };
      }
      if (result.error) {
        if (result.code === "INVALID_KEY_CHAR" && index < candidates.length - 1) continue;
        break;
      }
      const attempt = result.status || 0;
      if (attempt >= 200 && attempt < 300) break;
      // Some dialects answer a wrong credential with 400 plus a body keyword.
      // Requiring the keyword keeps a mis-configured dialect from burning every
      // candidate on its own timeout (worst case: 4 x 12 s per model).
      const keyRejected =
        attempt === 401 ||
        attempt === 403 ||
        (attempt === 400 &&
          /api[\s_-]?key|unauthoriz|invalid.{0,12}(key|token|api)/i.test(String(result.body || "")));
      if (!keyRejected || index === candidates.length - 1) break;
    }
    // unreachable today: candidates is never empty (L225) and every iteration assigns
    // result; kept as a tripwire so a future early break cannot return an undefined-status
    // payload.
    if (!result) {
      sendJson(res, 200, {
        ok: false,
        status: 0,
        code: "EXCEPTION",
        message: "no credential candidate",
        keySource,
      });
      return;
    }
    if (result.error) {
      // The panel persists this text to ~/.dsh/model-fold-probe.json as well, so
      // it goes through the same scrub as the HTTP failure branch: a thrown
      // header error can quote the offending header value verbatim.
      let networkMessage = String(result.error);
      for (const candidate of candidates) {
        if (candidate.value && candidate.value.length >= 8) {
          networkMessage = networkMessage.split(candidate.value).join("[redacted]");
        }
      }
      networkMessage = networkMessage.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]").slice(0, 300);
      sendJson(res, 200, { ok: false, status: 0, code: result.code || "NETWORK", message: networkMessage, keySource });
      return;
    }
    const status = result.status || 0;
    const ok = status >= 200 && status < 300;
    let message = "";
    if (!ok) {
      let raw = "";
      try {
        const parsed = JSON.parse(result.body || "{}");
        raw = String(parsed.error?.message || parsed.error || parsed.message || result.body || "");
      } catch {
        raw = String(result.body || "");
      }
      // The panel persists this text to ~/.dsh/model-fold-probe.json, and some
      // gateways echo the credential back inside the error, so scrub before it
      // is truncated (a truncated key can no longer be matched).
      for (const candidate of candidates) {
        if (candidate.value && candidate.value.length >= 8) {
          raw = raw.split(candidate.value).join("[redacted]");
        }
      }
      message = raw.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]").slice(0, 300);
    }
    sendJson(res, 200, {
      ok,
      status,
      code: ok ? "OK" : "HTTP_" + status,
      message,
      keySource,
    });
  } catch (error) {
    let message = String(error && error.message || error);
    // Same scrubbing as the success/failure branches: the panel persists this
    // text to ~/.dsh/model-fold-probe.json, so a credential echoed back inside a
    // thrown error must not survive there.
    for (const candidate of candidates) {
      if (candidate.value && candidate.value.length >= 8) {
        message = message.split(candidate.value).join("[redacted]");
      }
    }
    message = message.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]").slice(0, 300);
    sendJson(res, 200, { ok: false, status: 0, code: "EXCEPTION", message, keySource });
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
        handler: (req, res) => handleProbe(ctx, req, res),
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

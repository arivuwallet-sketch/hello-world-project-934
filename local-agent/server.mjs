/** Vehicle Insight Hub local agent reference implementation.
 * No vehicle behavior is simulated. Drivers must register real transports.
 */
import http from "node:http";
import crypto from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.VIH_AGENT_PORT || 45123);
const TOKEN = process.env.VIH_AGENT_TOKEN;
const ALLOWED_ORIGINS = new Set((process.env.VIH_ALLOWED_ORIGINS || "http://localhost:8080").split(","));
const windows = new Map();
const drivers = new Map();

export function registerDriver(id, driver) { drivers.set(id, driver); }
function json(res, status, body, origin) {
  res.writeHead(status, { "content-type": "application/json", ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}) });
  res.end(JSON.stringify(body));
}
function allowed(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) { json(res, 403, { error: "ORIGIN NOT AUTHORIZED" }); return false; }
  return true;
}
function authenticated(req, res) {
  if (!TOKEN) { json(res, 503, { error: "PAIRING REQUIRED: set VIH_AGENT_TOKEN" }); return false; }
  const given = req.headers.authorization?.replace(/^Bearer /, "") || "";
  const a = Buffer.from(given), b = Buffer.from(TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { json(res, 401, { error: "AUTHORIZATION REQUIRED" }, req.headers.origin); return false; }
  return true;
}
function rateAllowed(req, res) {
  const now = Date.now(), key = req.socket.remoteAddress || "local", recent = (windows.get(key) || []).filter((t) => now - t < 1000);
  if (recent.length >= 20) { json(res, 429, { error: "RATE LIMIT EXCEEDED" }, req.headers.origin); return false; }
  recent.push(now); windows.set(key, recent); return true;
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 65536) throw new Error("REQUEST TOO LARGE"); }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  if (!allowed(req, res) || !rateAllowed(req, res)) return;
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": req.headers.origin, "access-control-allow-headers": "Authorization, Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS" }); return res.end(); }
  if (!authenticated(req, res)) return;
  if (req.method === "GET" && req.url === "/v1/status") {
    const adapters = [];
    for (const [id, driver] of drivers) for (const device of await driver.discover()) adapters.push({ id: `${id}:${device.id}`, name: device.name, transport: driver.transport });
    const capabilities = { serial: drivers.has("serial"), bluetoothClassic: drivers.has("bluetooth-spp"), ble: drivers.has("ble"), usb: drivers.has("usb"), socketCan: drivers.has("socketcan"), j2534: drivers.has("j2534"), doip: drivers.has("doip"), vendorDrivers: [...drivers.keys()].filter((x) => x.startsWith("vendor:")) };
    return json(res, 200, { state: adapters.length ? "ADAPTER DISCOVERED" : "AGENT CONNECTED", version: "1.0.0", paired: true, capabilities, adapters }, req.headers.origin);
  }
  if (req.method === "POST" && req.url?.startsWith("/v1/")) {
    try {
      const input = await body(req);
      if (typeof input.driver !== "string" || !drivers.has(input.driver)) return json(res, 400, { error: "UNSUPPORTED BY ADAPTER" }, req.headers.origin);
      const driver = drivers.get(input.driver);
      if (req.url === "/v1/connect") return json(res, 200, await driver.connect(input.deviceId), req.headers.origin);
      if (req.url === "/v1/disconnect") return json(res, 200, await driver.disconnect(), req.headers.origin);
      if (req.url === "/v1/diagnostic") {
        if (!/^[0-9A-F]{2,512}$/i.test(input.payload || "")) return json(res, 400, { error: "INVALID REQUEST" }, req.headers.origin);
        const started = Date.now();
        const response = await driver.request(input.payload);
        console.info(JSON.stringify({ at: new Date().toISOString(), operation: "diagnostic", driver: input.driver, result: "response", latencyMs: Date.now() - started }));
        return json(res, 200, { response, latencyMs: Date.now() - started }, req.headers.origin);
      }
      return json(res, 404, { error: "NOT FOUND" }, req.headers.origin);
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : "HARDWARE COMMUNICATION UNAVAILABLE" }, req.headers.origin); }
  }
  json(res, 404, { error: "NOT FOUND" }, req.headers.origin);
});

server.listen(PORT, HOST, () => console.info(`Vehicle Insight Hub agent listening on ${HOST}:${PORT}`));
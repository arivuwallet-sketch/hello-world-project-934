import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_OPERATOR, can, permissionState, type Operator } from "./roles";
import { appendAudit, loadAudit, verifyAudit } from "./audit";
import { displayValue, DEFAULT_SETTINGS } from "./settings";
import { EMPTY_HEALTH, applyHealthEvent, summariseHealth } from "./connection-health";
import { featureMatrix, validateDisplay } from "./availability";
import { registerPlugin, unregisterPlugin, listPlugins } from "./plugins";

const memory = new Map<string, string>();

const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

beforeEach(() => {
  memory.clear();
  // The persistence helpers are browser-only; provide the storage they expect.
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  globalThis.localStorage = storage;
});

describe("roles and permissions", () => {
  it("denies diagnostics an owner role does not hold", () => {
    expect(permissionState(DEFAULT_OPERATOR, "FLASH_ECU")).toBe("NOT PERMITTED FOR THIS ROLE");
  });

  it("requires explicit authorisation for high-risk actions", () => {
    const workshop: Operator = { role: "Workshop", name: "Tech", authorized: [] };
    expect(permissionState(workshop, "EDIT_CALIBRATION")).toBe("AUTHORIZATION REQUIRED");
    expect(can({ ...workshop, authorized: ["EDIT_CALIBRATION"] }, "EDIT_CALIBRATION")).toBe(true);
  });

  it("grants read-only permissions without extra authorisation", () => {
    expect(can({ role: "Technician", name: "T", authorized: [] }, "READ_ECU")).toBe(true);
  });
});

describe("audit log", () => {
  const entry = {
    user: "Tech",
    role: "Workshop" as const,
    vehicle: null,
    vin: null,
    ecu: "7E0",
    file: null,
    calibration: null,
    operation: "Clear stored fault codes",
    permission: "CLEAR_DTC" as const,
    authorization: "EXPLICITLY CONFIRMED BY OPERATOR",
    hardware: "ELM327 v1.5",
    result: "SUCCESS" as const,
    errors: [],
  };

  it("chains entries and verifies them", async () => {
    await appendAudit(entry);
    await appendAudit({ ...entry, operation: "Read calibration" });
    expect(await verifyAudit()).toEqual({ state: "VERIFIED", brokenAt: null });
  });

  it("reports an empty log rather than inventing entries", async () => {
    expect(await verifyAudit()).toEqual({ state: "EMPTY", brokenAt: null });
  });

  it("detects a modified record", async () => {
    await appendAudit(entry);
    const records = loadAudit();
    const [first] = records;
    if (!first) throw new Error("expected an entry");
    memory.set("obd.auditLog", JSON.stringify([{ ...first, result: "FAILED" }]));
    expect((await verifyAudit()).state).toBe("TAMPERED");
  });
});

describe("unit localisation", () => {
  it("converts measured values to imperial", () => {
    expect(displayValue(100, "km/h", "imperial")).toEqual({ value: "62.1", unit: "mph" });
  });

  it("never converts an unavailable value into a number", () => {
    expect(displayValue(null, "km/h", "imperial").value).toBeNull();
    expect(displayValue(undefined, "°C", "metric").value).toBeNull();
  });

  it("leaves metric values untouched", () => {
    expect(displayValue(90.5, "°C", DEFAULT_SETTINGS.units)).toEqual({ value: "90.5", unit: "°C" });
  });
});

describe("connection health", () => {
  it("reports unavailable instead of a fabricated percentage", () => {
    const summary = summariseHealth(EMPTY_HEALTH);
    expect(summary.responseRate).toBe("DATA UNAVAILABLE");
    expect(summary.latencyMedianMs).toBe("DATA UNAVAILABLE");
  });

  it("counts real events and measured latency", () => {
    let health = EMPTY_HEALTH;
    health = applyHealthEvent(health, { kind: "request" });
    health = applyHealthEvent(health, { kind: "response", latencyMs: 40 });
    health = applyHealthEvent(health, { kind: "request" });
    health = applyHealthEvent(health, { kind: "timeout" });
    health = applyHealthEvent(health, { kind: "retry" });
    const summary = summariseHealth(health);
    expect(summary.responseRate).toBe("1 / 2 answered");
    expect(summary.latencyLastMs).toBe("40");
    expect(summary.timeouts).toBe(1);
    expect(summary.retries).toBe(1);
  });
});

describe("display validation", () => {
  it("refuses to display a value with no real source", () => {
    expect(validateDisplay({ sources: [], value: 3200 })).toEqual({ display: false, label: "DATA UNAVAILABLE" });
  });

  it("refuses to display a missing value even with a source", () => {
    expect(validateDisplay({ sources: ["REAL ECU RESPONSE"], value: null })).toEqual({
      display: false,
      label: "DATA UNAVAILABLE",
    });
  });

  it("passes a real ECU response through and preserves staleness", () => {
    expect(validateDisplay({ sources: ["REAL ECU RESPONSE"], value: 0, stale: true })).toEqual({
      display: true,
      stale: true,
    });
  });
});

describe("feature availability", () => {
  it("marks hardware features unsupported on an incapable browser", () => {
    const matrix = featureMatrix({
      browserSupported: false,
      connected: false,
      rawCanSupported: false,
      nativeBridge: false,
      flashAuthorized: false,
      datasetsImported: 0,
    });
    expect(matrix.find((row) => row.feature === "Live data & PID discovery")?.label).toBe("UNSUPPORTED BY BROWSER");
    expect(matrix.find((row) => row.feature === "EV diagnostics")?.label).toBe("DATA UNAVAILABLE");
    expect(matrix.find((row) => row.feature === "ECU programming")?.label).toBe("UNSUPPORTED BY ADAPTER");
  });

  it("keeps bypass features permanently unimplemented", () => {
    const matrix = featureMatrix({
      browserSupported: true,
      connected: true,
      rawCanSupported: true,
      nativeBridge: true,
      flashAuthorized: true,
      datasetsImported: 3,
    });
    expect(matrix.find((row) => row.feature === "Immobiliser / key bypass")?.label).toBe("NOT IMPLEMENTED");
    expect(matrix.find((row) => row.feature === "Emissions or safety defeat")?.label).toBe("NOT IMPLEMENTED");
    expect(matrix.find((row) => row.feature === "ECU programming")?.label).toBe("WRITE SUPPORTED");
  });
});

describe("plugin registry", () => {
  const provenance = {
    sourceName: "Example decoder",
    sourceUrl: "https://example.org/decoder",
    license: "MIT",
    importedAt: "2026-01-01T00:00:00.000Z",
    classification: "COMMUNITY" as const,
  };

  it("rejects a plugin with incomplete provenance", () => {
    const result = registerPlugin({
      id: "bad",
      name: "Bad",
      kind: "protocol-decoder",
      provenance: { ...provenance, license: "" },
      decodeFrame: () => null,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a fully attributed plugin", () => {
    const result = registerPlugin({
      id: "good",
      name: "Good",
      kind: "protocol-decoder",
      provenance,
      decodeFrame: () => null,
    });
    expect(result.ok).toBe(true);
    expect(listPlugins("protocol-decoder").some((plugin) => plugin.id === "good")).toBe(true);
    unregisterPlugin("good");
  });
});

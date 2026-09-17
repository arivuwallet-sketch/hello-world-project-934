import { describe, expect, it } from "vitest";
import { importServiceDefinitions, validateServiceDefinition, validateServiceResponse, type ServiceDefinition } from "./service-functions/definitions";
import { evaluateTest, passHasEvidence, TEST_CATALOG } from "./diagnostic-tests";
import { createSignedReport, customerData, type ReportDatum } from "./report-modes";

const definition: ServiceDefinition = {
  id: "documented-fan-test", name: "Documented fan test", kind: "ACTIVE TEST",
  provenance: { sourceName: "Manufacturer service manual", sourceUrl: "https://example.com/manual", license: "Licensed workshop reference", importedAt: "2026-01-01T00:00:00Z", classification: "MANUFACTURER-SPECIFIC", version: "1" },
  applicability: { make: "Example", ecu: "7E0", protocol: "ISO 15765-4" }, preconditions: ["Engine off"], authorizationRequired: true,
  safetyWarning: "Keep clear of the fan.", request: "31010001", positiveResponsePrefix: "71010001",
};

describe("service definition execution guard (115)", () => {
  it("requires complete provenance and a declarative hex request", () => {
    expect(validateServiceDefinition(definition)).toBe(true);
    expect(validateServiceDefinition({ ...definition, provenance: { ...definition.provenance, license: "" } })).toBe(false);
    expect(validateServiceDefinition({ ...definition, request: "runFan()" })).toBe(false);
  });
  it("reports success only from the documented positive prefix", () => {
    expect(validateServiceResponse(definition, "71 01 00 01").result).toBe("SUCCESS");
    expect(validateServiceResponse(definition, "7F 31 22").result).toBe("FAILED");
    expect(validateServiceResponse(definition, "62 F1 90").result).toBe("UNCONFIRMED");
  });
  it("does not ship built-in executable definitions", () => {
    expect(() => importServiceDefinitions("[]")).toThrow("SERVICE DEFINITION UNAVAILABLE");
  });
});

describe("hardware diagnostic tests (118)", () => {
  it("cannot pass without real evidence", () => {
    const test = TEST_CATALOG.find((entry) => entry.id === "mode01")!;
    const result = evaluateTest(test, { connected: true, adapterIdentity: "ELM", protocol: "6 CAN", realResponse: null, latencyMs: null });
    expect(result.result).toBe("INSUFFICIENT DATA");
  });
  it("attaches evidence to every passing result", () => {
    const test = TEST_CATALOG.find((entry) => entry.id === "mode01")!;
    const result = evaluateTest(test, { connected: true, adapterIdentity: "ELM", protocol: "6 CAN", realResponse: "41 00 BE 3E B8 13", latencyMs: 24 });
    expect(result.result).toBe("PASS"); expect(passHasEvidence(result)).toBe(true); expect(result.latencyMs).toBe(24);
  });
  it("contains all requested test categories", () => {
    expect(new Set(TEST_CATALOG.map((entry) => entry.category)).size).toBe(11);
    expect(TEST_CATALOG.length).toBeGreaterThan(40);
  });
});

describe("customer and engineering reports (117)", () => {
  const data: ReportDatum[] = [
    { label: "RPM", value: "2143 rpm", origin: "ECU REPORTED", source: "PID 0C", raw: "41 0C 21 7C" },
    { label: "Technician note", value: "Inspect wiring", origin: "USER ENTERED", source: "Technician" },
  ];
  it("customer mode removes raw hexadecimal", () => expect(customerData(data)[0]?.raw).toBeUndefined());
  it("hashes the complete report and labels origins", async () => {
    const report = await createSignedReport({ mode: "ENGINEERING", softwareVersion: "1", vehicle: "Vehicle", vin: null, technician: "Tech", data, datasetVersions: [], hardware: "Adapter", limitations: [] }, "Tech");
    expect(report.hash).toMatch(/^[0-9a-f]{64}$/); expect(report.signature).toContain("Tech"); expect(report.data[0]?.origin).toBe("ECU REPORTED");
  });
});
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_WIZARD_EVIDENCE, evaluateWizard, wizardReady } from "./wizard";
import { capabilityClaims, latencyStats } from "./adapter-health";
import { EMPTY_PROGRESS, SCAN_TARGETS, newSystemResult, progressPercent, summariseScan } from "./full-scan";
import { buildTopology, requestIdFor, topologyEdges } from "./topology";
import { EvidenceRecorder, triggerCause, captureToCsv, type TriggerDefinition, type EvidenceSample } from "./triggers";
import { assessEvidence, correlateSignal } from "./correlation";
import { applyObservation, planConclusion, standardEvidencePlan } from "./guided";

describe("connection wizard (107)", () => {
  it("never passes a later stage from an earlier success", () => {
    const results = evaluateWizard({
      ...EMPTY_WIZARD_EVIDENCE,
      secureContext: true,
      serial: true,
      selectedAdapter: "OBDLink",
      selectedTransport: "Web Serial",
      discoveredDevice: "OBDLink",
      permissionGranted: true,
      transportOpen: true,
      adapterIdentity: "ELM327 v1.5",
    });
    expect(results.find((r) => r.stage === "Transport connection")?.status).toBe("PASSED");
    expect(results.find((r) => r.stage === "Protocol detection")?.status).toBe("EVIDENCE MISSING");
    expect(results.find((r) => r.stage === "ECU discovery")?.status).toBe("EVIDENCE MISSING");
    expect(wizardReady(results)).toBe(false);
  });

  it("reports unsupported browsers instead of failing quietly", () => {
    const results = evaluateWizard(EMPTY_WIZARD_EVIDENCE);
    expect(results[0]!.status).toBe("UNSUPPORTED BY BROWSER");
    expect(results[0]!.evidence).toBeNull();
  });

  it("only reports ready with an open transport and a real ECU response", () => {
    const results = evaluateWizard({
      ...EMPTY_WIZARD_EVIDENCE,
      secureContext: true,
      serial: true,
      transportOpen: true,
      respondingEcus: ["7E8"],
      lastEcuResponseAt: Date.now(),
    });
    expect(wizardReady(results)).toBe(true);
  });
});

describe("adapter capabilities (108)", () => {
  it("keeps advertised, detected and verified separate", () => {
    const claims = capabilityClaims({
      identity: "STN2120 v5.7.1",
      transport: "serial",
      protocolCode: "6",
      rawFramesObserved: false,
      isotpObserved: false,
      udsObserved: false,
      nativeBridge: false,
      voltageObserved: false,
    });
    const canfd = claims.find((c) => c.capability === "CAN-FD")!;
    expect(canfd.advertised).toBe("YES");
    expect(canfd.verified).toBe("NO");
    const raw = claims.find((c) => c.capability === "Raw CAN")!;
    expect(raw.verified).toBe("UNKNOWN");
    expect(claims.find((c) => c.capability === "CAN")!.detected).toBe("YES");
  });

  it("verifies raw CAN only after frames were observed", () => {
    const claims = capabilityClaims({
      identity: "STN1170",
      transport: "serial",
      protocolCode: "6",
      rawFramesObserved: true,
      isotpObserved: true,
      udsObserved: true,
      nativeBridge: false,
      voltageObserved: false,
    });
    expect(claims.find((c) => c.capability === "Raw CAN")!.verified).toBe("YES");
    expect(claims.find((c) => c.capability === "J2534")!.verified).toBe("UNKNOWN");
  });

  it("reports latency as unavailable with no samples", () => {
    expect(latencyStats([]).average).toBe("DATA UNAVAILABLE");
    expect(latencyStats([10, 30, 20]).min).toBe("10 ms");
  });
});

describe("full scan (109)", () => {
  it("has no progress before work is planned", () => {
    expect(progressPercent(EMPTY_PROGRESS)).toBeNull();
    expect(progressPercent({ ...EMPTY_PROGRESS, planned: 40, completed: 10 })).toBe(25);
  });

  it("starts every probed address as not detected", () => {
    const row = newSystemResult(SCAN_TARGETS[0]!);
    expect(row.status).toBe("NOT DETECTED");
    expect(row.evidence).toEqual([]);
  });

  it("counts only responding modules in the summary", () => {
    const summary = summariseScan([
      { ...newSystemResult(SCAN_TARGETS[0]!), status: "RESPONDING", storedDtcs: ["P0301"] },
      { ...newSystemResult(SCAN_TARGETS[5]!), status: "NOT RESPONDING", storedDtcs: ["P0420"] },
    ]);
    expect(summary.responding).toBe(1);
    expect(summary.totalStored).toBe(1);
  });
});

describe("topology (110)", () => {
  it("builds no nodes without discovered modules", () => {
    expect(buildTopology([], { nativeBridge: false })).toEqual([]);
  });

  it("maps response headers back to request IDs and refuses invalid ones", () => {
    expect(requestIdFor("7E8")).toBe("7E0");
    expect(requestIdFor("123")).toBeNull();
  });

  it("draws no edges when no gateway responded", () => {
    const nodes = buildTopology([{ header: "7E8", system: "Engine" }, { header: "7EA", system: "Transmission" }]);
    expect(topologyEdges(nodes)).toEqual([]);
    expect(nodes[0]!.programmingCapable).toBe("UNSUPPORTED BY ADAPTER");
  });

  it("marks a node stale when its last response is old", () => {
    const nodes = buildTopology([{ header: "7E8", system: "Engine", lastSeen: Date.now() - 60_000 }]);
    expect(nodes[0]!.state).toBe("STALE");
  });
});

describe("evidence recorder (112)", () => {
  const sample = (value: number, t: number): EvidenceSample => ({
    timestamp: t,
    signal: "coolant",
    value,
    unit: "°C",
    ecu: "7E8",
    pid: "05",
    canId: "7E8",
    rawResponse: "41 05 8C",
    protocol: "ISO 15765-4",
    quality: "GOOD",
  });
  const trigger: TriggerDefinition = {
    id: "t1",
    name: "Coolant over 105",
    signal: "coolant",
    comparison: "greater",
    threshold: 105,
    unit: "°C",
    preSeconds: 10,
    postSeconds: 5,
    enabled: true,
  };

  let recorder: EvidenceRecorder;
  beforeEach(() => {
    recorder = new EvidenceRecorder();
  });

  it("does not fire below the threshold", () => {
    expect(recorder.push(sample(90, 1000), [trigger])).toHaveLength(0);
  });

  it("fires from a real sample and keeps the pre-trigger buffer", () => {
    recorder.push(sample(90, 1000), [trigger]);
    recorder.push(sample(100, 2000), [trigger]);
    const fired = recorder.push(sample(107, 3000), [trigger]);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.preSamples.length).toBe(3);
    expect(fired[0]!.cause).toContain("107");
  });

  it("closes a capture from real post-trigger samples, not a timer", () => {
    const fired = recorder.push(sample(110, 1000), [trigger])[0]!;
    recorder.push(sample(109, 3000), [trigger]);
    expect(fired.closed).toBe(false);
    recorder.push(sample(108, 7000), [trigger]);
    expect(fired.closed).toBe(true);
    expect(fired.postSamples).toHaveLength(2);
  });

  it("refuses a threshold trigger with no threshold", () => {
    expect(triggerCause({ ...trigger, threshold: null }, sample(200, 1), undefined)).toBeNull();
  });

  it("exports every real sample to CSV", () => {
    const fired = recorder.push(sample(110, 1000), [trigger])[0]!;
    const csv = captureToCsv(fired);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("41 05 8C");
  });
});

describe("DTC correlation (113)", () => {
  it("reports no data recorded rather than inventing a window", () => {
    const w = correlateSignal("Coolant", "°C", undefined, 1000);
    expect(w.availability).toBe("NO DATA RECORDED");
    expect(w.timeDistanceMs).toBeNull();
  });

  it("marks a sparse window as insufficient", () => {
    const w = correlateSignal("Coolant", "°C", [{ t: 900, v: 90 }], 1000);
    expect(w.availability).toBe("INSUFFICIENT DATA");
  });

  it("refuses a conclusion without evidence", () => {
    const assessment = assessEvidence({ code: "P0301", freezeFrame: [], windows: [] });
    expect(assessment.conclusion).toBe("INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION");
    expect(assessment.interpretations).toEqual([]);
  });

  it("reports observed evidence without naming a failed part", () => {
    const samples = Array.from({ length: 8 }, (_, i) => ({ t: 1000 + i * 100, v: 2000 + i }));
    const assessment = assessEvidence({
      code: "P0301",
      freezeFrame: [{ label: "Engine RPM", value: "2180 rpm" }],
      windows: [correlateSignal("Engine RPM", "rpm", samples, 1400)],
    });
    expect(assessment.conclusion).toBe("OBSERVED EVIDENCE ONLY");
    expect(assessment.observed.join(" ")).toContain("Engine RPM");
    expect(assessment.observed.join(" ").toLowerCase()).not.toContain("bad");
  });
});

describe("guided diagnostics (114)", () => {
  it("starts with no observations and an insufficient-data conclusion", () => {
    const plan = standardEvidencePlan("P0301");
    expect(plan.steps.every((s) => s.observed === null)).toBe(true);
    expect(planConclusion(plan.steps)).toBe("INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION");
  });

  it("never copies the expected value into observed", () => {
    const plan = standardEvidencePlan("P0301");
    const step = applyObservation(plan.steps[0]!, "   ", "USER ENTERED", "PASS");
    expect(step.observed).toBeNull();
    expect(step.status).toBe("WAITING FOR DATA");
  });

  it("records a real observation with its origin", () => {
    const plan = standardEvidencePlan("P0301");
    const step = applyObservation(plan.steps[2]!, "RPM 2180, coolant 91 C", "OBSERVED (LIVE DATA)", "PASS");
    expect(step.observedOrigin).toBe("OBSERVED (LIVE DATA)");
    expect(step.observed).toBe("RPM 2180, coolant 91 C");
  });

  it("reports a confirmed fault only from a recorded failure", () => {
    const plan = standardEvidencePlan("P0301");
    const steps = plan.steps.map((s) => applyObservation(s, "measured", "USER ENTERED", "PASS"));
    expect(planConclusion(steps)).toContain("ALL DOCUMENTED STEPS PASSED");
    steps[4] = applyObservation(steps[4]!, "0.2 V, out of specification", "USER ENTERED", "FAIL");
    expect(planConclusion(steps)).toBe("FAULT CONFIRMED BY A RECORDED OBSERVATION");
  });
});

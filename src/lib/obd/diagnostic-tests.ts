export type TestResult = "PASS" | "FAIL" | "SKIPPED" | "UNSUPPORTED" | "NOT RUN" | "INSUFFICIENT DATA";
export type TestCategory = "HARDWARE" | "TRANSPORT" | "PROTOCOL" | "OBD" | "PIDS" | "DTC" | "VIN" | "OBFCM" | "EV" | "ECU TUNING" | "PERFORMANCE";
export interface DiagnosticTestResult { id: string; category: TestCategory; name: string; startedAt: number; endedAt: number; result: TestResult; evidence: string[]; source: string; error: string | null; latencyMs: number | null; rawDataReference: string | null }
export interface TestContext { connected: boolean; adapterIdentity: string | null; protocol: string | null; realResponse: string | null; latencyMs: number | null }

export const TEST_CATALOG: { id: string; category: TestCategory; name: string; source: string }[] = [
  ["adapter-identity", "HARDWARE", "Adapter identification", "ATI response"], ["serial-io", "TRANSPORT", "Transport write/read", "Adapter traffic log"],
  ["protocol", "PROTOCOL", "Protocol detection", "AT DPN response"], ["mode01", "OBD", "Mode 01 response", "ECU response"],
  ["pid-validation", "PIDS", "PID response validation", "Decoder pipeline"], ["stored-dtc", "DTC", "Stored fault codes", "Mode 03 response"],
  ["vin", "VIN", "VIN length and encoding", "Mode 09 PID 02 response"], ["obfcm", "OBFCM", "OBFCM 0917 layout", "Mode 09 InfoType 17 response"],
  ["ev", "EV", "EV definition applicability", "Imported EV dataset"], ["tuning", "ECU TUNING", "Calibration prerequisites", "ECU identification and calibration hash"],
  ["performance", "PERFORMANCE", "Measured performance source", "Recorded real measurement"],
].map(([id, category, name, source]) => ({ id: id!, category: category as TestCategory, name: name!, source: source! }));

export function evaluateTest(test: typeof TEST_CATALOG[number], context: TestContext): DiagnosticTestResult {
  const startedAt = Date.now();
  let result: TestResult = "INSUFFICIENT DATA";
  const evidence: string[] = [];
  if (test.id === "adapter-identity") {
    if (!context.connected) result = "UNSUPPORTED";
    else if (context.adapterIdentity) { result = "PASS"; evidence.push(context.adapterIdentity); }
  } else if (test.id === "protocol") {
    if (context.protocol) { result = "PASS"; evidence.push(context.protocol); }
  } else if (["serial-io", "mode01", "pid-validation", "stored-dtc"].includes(test.id)) {
    if (!context.connected) result = "UNSUPPORTED";
    else if (context.realResponse) { result = "PASS"; evidence.push(context.realResponse); }
  } else result = "NOT RUN";
  return { ...test, startedAt, endedAt: Date.now(), result, evidence, error: null, latencyMs: context.latencyMs, rawDataReference: context.realResponse };
}

export function passHasEvidence(result: DiagnosticTestResult) { return result.result !== "PASS" || result.evidence.length > 0; }
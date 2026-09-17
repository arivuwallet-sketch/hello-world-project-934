export type TestResult = "PASS" | "FAIL" | "SKIPPED" | "UNSUPPORTED" | "NOT RUN" | "INSUFFICIENT DATA";
export type TestCategory = "HARDWARE" | "TRANSPORT" | "PROTOCOL" | "OBD" | "PIDS" | "DTC" | "VIN" | "OBFCM" | "EV" | "ECU TUNING" | "PERFORMANCE";
export interface DiagnosticTestResult { id: string; category: TestCategory; name: string; startedAt: number; endedAt: number; result: TestResult; evidence: string[]; source: string; error: string | null; latencyMs: number | null; rawDataReference: string | null }
export interface TestContext { connected: boolean; adapterIdentity: string | null; protocol: string | null; realResponse: string | null; latencyMs: number | null }

export const TEST_CATALOG: { id: string; category: TestCategory; name: string; source: string }[] = [
  ["adapter-identity", "HARDWARE", "Adapter discovery / identity", "ATI response"], ["serial-open", "HARDWARE", "Serial open", "Web Serial transport"],
  ["serial-io", "TRANSPORT", "Serial write / read", "Adapter traffic log"], ["ble", "HARDWARE", "BLE discovery / connection / characteristic", "Web Bluetooth transport"],
  ["usb", "HARDWARE", "USB access", "WebUSB transport"], ["j2534", "HARDWARE", "J2534 driver validation", "Local agent native driver"], ["doip-link", "HARDWARE", "DoIP connection", "Local agent DoIP driver"],
  ["stability", "TRANSPORT", "Connection stability", "Adapter traffic log"], ["timeout", "TRANSPORT", "Timeout behavior", "Scheduler events"], ["retry", "TRANSPORT", "Retry behavior", "Scheduler events"], ["disconnect", "TRANSPORT", "Disconnect detection", "Transport state"], ["reconnect", "TRANSPORT", "Reconnect", "Transport state"], ["latency", "TRANSPORT", "Latency", "Measured request/response time"],
  ["protocol", "PROTOCOL", "Protocol detection", "AT DPN response"], ["can11", "PROTOCOL", "CAN 11-bit", "Detected CAN traffic"], ["can29", "PROTOCOL", "CAN 29-bit", "Detected CAN traffic"], ["canfd", "PROTOCOL", "CAN-FD", "Native driver capability"], ["isotp", "PROTOCOL", "ISO-TP", "Validated multi-frame response"], ["iso9141", "PROTOCOL", "ISO 9141-2", "AT DPN response"], ["kwp", "PROTOCOL", "KWP2000", "AT DPN response"], ["j1850", "PROTOCOL", "SAE J1850", "AT DPN response"], ["uds", "PROTOCOL", "UDS", "Positive UDS response"], ["doip", "PROTOCOL", "DoIP", "Native driver response"],
  ...Array.from({ length: 10 }, (_, index) => [`mode${String(index + 1).padStart(2, "0")}`, "OBD", `Mode ${(index + 1).toString(16).toUpperCase().padStart(2, "0")}`, "ECU response"]),
  ["pid-bitmap", "PIDS", "Support bitmap", "Mode 01 bitmap response"], ["pid-length", "PIDS", "Length validation", "Decoder pipeline"], ["pid-formula", "PIDS", "Formula and scaling", "Decoder pipeline"], ["pid-units", "PIDS", "Unit conversion", "Decoder pipeline"], ["pid-range", "PIDS", "Range validation", "Decoder pipeline"], ["pid-malformed", "PIDS", "Malformed response rejection", "Decoder pipeline"], ["pid-unsupported", "PIDS", "Unsupported PID", "ECU response"], ["pid-stale", "PIDS", "Stale data", "Timestamp and connection state"],
  ["stored-dtc", "DTC", "Stored DTC", "Mode 03 response"], ["pending-dtc", "DTC", "Pending DTC", "Mode 07 response"], ["permanent-dtc", "DTC", "Permanent DTC", "Mode 0A response"], ["freeze", "DTC", "Freeze frame", "Mode 02 response"], ["clear", "DTC", "Clear response", "Positive 0x44 response"],
  ["vin", "VIN", "VIN length / encoding / validation", "Mode 09 PID 02 response"], ["obfcm", "OBFCM", "0917 response and layout", "Mode 09 InfoType 17 response"],
  ["ev-dataset", "EV", "Dataset loading / applicability", "Imported EV dataset"], ["ev-soc", "EV", "SoC / SoH", "Resolved EV definition and ECU response"], ["ev-pack", "EV", "Pack / cell / thermal / charging", "Resolved EV definition and ECU response"],
  ["tuning-id", "ECU TUNING", "ECU identification", "Read DID response"], ["tuning-backup", "ECU TUNING", "Backup / hashing / file validation", "Calibration bytes and SHA-256"], ["tuning-compat", "ECU TUNING", "Compatibility / checksum", "Calibration validation"], ["tuning-write", "ECU TUNING", "Programming / verification / recovery", "Programming state and ECU responses"],
  ["performance-speed", "PERFORMANCE", "OBD / GPS speed and mismatch", "Recorded real measurements"], ["performance-runs", "PERFORMANCE", "0–60 / quarter-mile / insufficient samples", "Recorded real measurements"],
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
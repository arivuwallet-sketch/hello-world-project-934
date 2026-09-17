/**
 * Module 107 — connection wizard stage model.
 *
 * Every stage carries its own evidence. A stage is NEVER marked PASSED because
 * the previous stage passed: `evaluateStage` only returns PASSED when the
 * evidence field for that specific stage is present.
 */

export const WIZARD_STAGES = [
  "Browser / environment",
  "Local agent availability",
  "Adapter selection",
  "Transport selection",
  "Device discovery",
  "Permission grant",
  "Transport connection",
  "Adapter identification",
  "Adapter initialisation",
  "Protocol detection",
  "ECU discovery",
  "VIN acquisition",
  "Vehicle profile resolution",
  "Capability discovery",
  "Final connection validation",
  "Full-system scan",
] as const;

export type WizardStage = (typeof WIZARD_STAGES)[number];

export type StageStatus =
  | "PENDING"
  | "IN PROGRESS"
  | "PASSED"
  | "FAILED"
  | "UNSUPPORTED BY BROWSER"
  | "UNSUPPORTED BY ADAPTER"
  | "PERMISSION DENIED"
  | "NOT REQUIRED"
  | "EVIDENCE MISSING";

export interface StageResult {
  stage: WizardStage;
  status: StageStatus;
  /** Human-readable evidence actually observed, or null when there is none. */
  evidence: string | null;
  detail?: string;
}

export interface WizardEvidence {
  secureContext: boolean;
  serial: boolean;
  bluetooth: boolean;
  usb: boolean;
  /** Native/local agent presence must be probed, never assumed. */
  localAgent: boolean | null;
  selectedAdapter: string | null;
  selectedTransport: string | null;
  /** Device the user actually picked in the browser chooser. */
  discoveredDevice: string | null;
  permissionGranted: boolean | null;
  transportOpen: boolean;
  /** Raw ATI / STI response text. */
  adapterIdentity: string | null;
  initialisationLog: string | null;
  /** Protocol only counts when the adapter reported a detected number. */
  protocolCode: string | null;
  protocolName: string | null;
  respondingEcus: string[];
  vin: string | null;
  vehicleProfile: string | null;
  supportedPidCount: number | null;
  lastEcuResponseAt: number | null;
  scanCompletedAt: number | null;
}

export const EMPTY_WIZARD_EVIDENCE: WizardEvidence = {
  secureContext: false,
  serial: false,
  bluetooth: false,
  usb: false,
  localAgent: null,
  selectedAdapter: null,
  selectedTransport: null,
  discoveredDevice: null,
  permissionGranted: null,
  transportOpen: false,
  adapterIdentity: null,
  initialisationLog: null,
  protocolCode: null,
  protocolName: null,
  respondingEcus: [],
  vin: null,
  vehicleProfile: null,
  supportedPidCount: null,
  lastEcuResponseAt: null,
  scanCompletedAt: null,
};

function stage(
  name: WizardStage,
  ok: boolean,
  evidence: string | null,
  pendingStatus: StageStatus = "PENDING",
  detail?: string,
): StageResult {
  return {
    stage: name,
    status: ok ? "PASSED" : pendingStatus,
    evidence: ok ? evidence : null,
    ...(detail ? { detail } : {}),
  };
}

export function evaluateWizard(e: WizardEvidence): StageResult[] {
  const transports = [e.serial && "Web Serial", e.bluetooth && "Web Bluetooth", e.usb && "WebUSB"].filter(
    Boolean,
  ) as string[];

  return [
    e.secureContext && transports.length > 0
      ? stage("Browser / environment", true, `Secure context · ${transports.join(", ")}`)
      : {
          stage: "Browser / environment",
          status: "UNSUPPORTED BY BROWSER",
          evidence: null,
          detail: e.secureContext
            ? "No hardware access API in this browser (Chromium desktop or Android required)"
            : "BROWSER HARDWARE ACCESS UNSUPPORTED — insecure context",
        },
    e.localAgent === null
      ? { stage: "Local agent availability", status: "PENDING", evidence: null, detail: "Not probed" }
      : e.localAgent
        ? stage("Local agent availability", true, "Local agent answered a probe")
        : {
            stage: "Local agent availability",
            status: "NOT REQUIRED",
            evidence: null,
            detail: "No local agent detected — browser transports only, no J2534 bridge",
          },
    stage("Adapter selection", Boolean(e.selectedAdapter), e.selectedAdapter),
    stage("Transport selection", Boolean(e.selectedTransport), e.selectedTransport),
    stage("Device discovery", Boolean(e.discoveredDevice), e.discoveredDevice),
    e.permissionGranted === false
      ? { stage: "Permission grant", status: "PERMISSION DENIED", evidence: null }
      : stage("Permission grant", e.permissionGranted === true, "Device access granted by the user"),
    stage("Transport connection", e.transportOpen, "Port or GATT characteristic open"),
    stage("Adapter identification", Boolean(e.adapterIdentity), e.adapterIdentity),
    stage("Adapter initialisation", Boolean(e.initialisationLog), e.initialisationLog),
    e.protocolCode
      ? stage("Protocol detection", true, `${e.protocolCode} — ${e.protocolName ?? "unnamed"}`)
      : { stage: "Protocol detection", status: "EVIDENCE MISSING", evidence: null, detail: "PROTOCOL DETECTION FAILED or not attempted" },
    stage(
      "ECU discovery",
      e.respondingEcus.length > 0,
      e.respondingEcus.length > 0 ? `${e.respondingEcus.join(", ")} responding` : null,
      "EVIDENCE MISSING",
      "VEHICLE/ECU NOT RESPONDING",
    ),
    stage("VIN acquisition", Boolean(e.vin), e.vin, "EVIDENCE MISSING", "VIN not returned by any module"),
    stage(
      "Vehicle profile resolution",
      Boolean(e.vehicleProfile),
      e.vehicleProfile,
      "EVIDENCE MISSING",
      "Profile requires a decoded VIN or explicit user entry",
    ),
    stage(
      "Capability discovery",
      (e.supportedPidCount ?? 0) > 0,
      e.supportedPidCount ? `${e.supportedPidCount} supported PIDs reported by the ECU` : null,
      "EVIDENCE MISSING",
    ),
    e.transportOpen && e.respondingEcus.length > 0 && e.lastEcuResponseAt !== null
      ? stage("Final connection validation", true, `Last ECU response ${new Date(e.lastEcuResponseAt).toLocaleTimeString()}`)
      : {
          stage: "Final connection validation",
          status: "EVIDENCE MISSING",
          evidence: null,
          detail: "Needs an open transport AND a real ECU response",
        },
    stage(
      "Full-system scan",
      e.scanCompletedAt !== null,
      e.scanCompletedAt ? `Completed ${new Date(e.scanCompletedAt).toLocaleTimeString()}` : null,
    ),
  ];
}

export function wizardReady(results: StageResult[]): boolean {
  const validation = results.find((r) => r.stage === "Final connection validation");
  return validation?.status === "PASSED";
}

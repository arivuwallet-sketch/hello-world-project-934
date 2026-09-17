import type { HealthAssessment } from "./analysis";
import type { PerformanceSession } from "./performance";
import type { ServiceRecord } from "./service";
import type { TuningProject } from "./tuning/projects";

export interface ReportSection {
  title: string;
  rows: { label: string; value: string }[];
  /** Shown when the section has no real data — never filled with placeholders. */
  unavailable?: string;
}

export interface DiagnosticReport {
  generatedAt: number;
  technician: string;
  vehicleLabel: string;
  vin: string | null;
  sections: ReportSection[];
  provenance: { label: string; value: string }[];
  warnings: string[];
  limitations: string[];
}

const UNAVAILABLE = "UNAVAILABLE";

function section(title: string, rows: { label: string; value: string }[], reason: string): ReportSection {
  return rows.length > 0 ? { title, rows } : { title, rows: [], unavailable: reason };
}

export function buildReport(input: {
  technician: string;
  vehicleLabel: string;
  vin: string | null;
  adapter: string;
  protocol: string;
  connected: boolean;
  storedDtcs: string[];
  pendingDtcs: string[];
  permanentDtcs: string[];
  readiness: { name: string; supported: boolean; complete: boolean }[];
  freeze: { label: string; value: string }[];
  liveSignals: { label: string; value: string; source: string }[];
  evSignals: { label: string; value: string }[];
  obfcm: { label: string; value: string }[];
  tuning: TuningProject | null;
  performance: PerformanceSession[];
  serviceHistory: ServiceRecord[];
  health: HealthAssessment[];
  dataSources: { label: string; value: string }[];
}): DiagnosticReport {
  const warnings: string[] = [];
  if (!input.connected) warnings.push("OBD ADAPTER NOT CONNECTED — no live values were read for this report.");
  if (input.storedDtcs.length > 0) warnings.push(`${input.storedDtcs.length} stored fault code(s) present.`);
  if (input.tuning?.programmingOutcome && input.tuning.programmingOutcome !== "PROGRAMMING SUCCESSFUL") {
    warnings.push(`Programming outcome: ${input.tuning.programmingOutcome}.`);
  }

  const sections: ReportSection[] = [
    section(
      "Session",
      [
        { label: "Vehicle", value: input.vehicleLabel || UNAVAILABLE },
        { label: "VIN", value: input.vin ?? UNAVAILABLE },
        { label: "Adapter", value: input.adapter || UNAVAILABLE },
        { label: "Protocol", value: input.protocol || UNAVAILABLE },
      ],
      "No session data",
    ),
    section(
      "Fault codes",
      [
        ...input.storedDtcs.map((code) => ({ label: "Stored", value: code })),
        ...input.pendingDtcs.map((code) => ({ label: "Pending", value: code })),
        ...input.permanentDtcs.map((code) => ({ label: "Permanent", value: code })),
      ],
      "No codes reported by the ECU",
    ),
    section(
      "Freeze frame",
      input.freeze,
      "No freeze frame stored in the ECU",
    ),
    section(
      "Readiness monitors",
      input.readiness.map((monitor) => ({
        label: monitor.name,
        value: !monitor.supported ? "NOT SUPPORTED" : monitor.complete ? "READY" : "NOT READY",
      })),
      "Monitor status not reported",
    ),
    section(
      "Live data",
      input.liveSignals.map((signal) => ({ label: signal.label, value: `${signal.value} (${signal.source})` })),
      "No live values received",
    ),
    section("EV data", input.evSignals, "No EV definitions resolved for this vehicle"),
    section("OBFCM", input.obfcm, "OBFCM DATA UNAVAILABLE"),
    section(
      "Tuning",
      input.tuning
        ? [
            { label: "Project status", value: input.tuning.status },
            { label: "Original calibration", value: input.tuning.original?.filename ?? UNAVAILABLE },
            { label: "Original hash", value: input.tuning.original?.hash ?? UNAVAILABLE },
            { label: "Modified calibration", value: input.tuning.modified?.filename ?? UNAVAILABLE },
            { label: "Calibration version", value: input.tuning.modified?.version ?? UNAVAILABLE },
            { label: "Validation", value: input.tuning.validationStatus ?? UNAVAILABLE },
            { label: "Programming outcome", value: input.tuning.programmingOutcome ?? UNAVAILABLE },
          ]
        : [],
      "No tuning project linked",
    ),
    section(
      "Performance measurements",
      input.performance.map((entry) => ({
        label: `${entry.result.kind} — ${new Date(entry.recordedAt).toLocaleString()}`,
        value:
          entry.result.elapsedSeconds == null
            ? (entry.result.unavailableReason ?? UNAVAILABLE)
            : `${entry.result.elapsedSeconds} s, ${entry.result.sampleCount} samples, sources ${entry.result.sources.join("/")}`,
      })),
      "No recorded real measurements",
    ),
    section(
      "Vehicle health",
      input.health.map((entry) => ({ label: entry.area, value: `${entry.state} — ${entry.evidence}` })),
      "INSUFFICIENT DATA",
    ),
    section(
      "Service history",
      input.serviceHistory.map((entry) => ({
        label: `${entry.date} — ${entry.service}`,
        value: `${entry.mileageKm ?? UNAVAILABLE} km · ${entry.technician || UNAVAILABLE}`,
      })),
      "No service records entered",
    ),
  ];

  return {
    generatedAt: Date.now(),
    technician: input.technician,
    vehicleLabel: input.vehicleLabel,
    vin: input.vin,
    sections,
    provenance: input.dataSources,
    warnings,
    limitations: [
      "Every value in this report originates from a real adapter, ECU response, measurement or explicit user entry. Fields marked UNAVAILABLE were not provided by any real source.",
      "Community and vehicle-specific signal definitions are not OEM-authoritative.",
      "Calibration validation passing does not mean a calibration is safe for the vehicle.",
    ],
  };
}

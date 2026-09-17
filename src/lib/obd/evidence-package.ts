/**
 * Module 123 — diagnostic evidence package.
 *
 * The package contains exactly what the session really holds. A file that has no
 * real source is omitted and listed as unavailable — never written with filler.
 */
import { sha256Hex } from "./persist";

export interface EvidenceFile {
  name: string;
  content: string;
  createdAt: string;
  sessionId: string;
  sourceId: string;
  checksum: string;
}

export interface EvidencePackage {
  createdAt: string;
  sessionId: string;
  files: EvidenceFile[];
  omitted: { name: string; reason: string }[];
  manifest: string;
  manifestHash: string;
}

export const PACKAGE_FILES = [
  "vehicle.json",
  "session.json",
  "ecu.json",
  "topology.json",
  "dtcs.json",
  "freeze_frames.json",
  "readiness.json",
  "telemetry.csv",
  "raw_obd.log",
  "raw_can.log",
  "raw_uds.log",
  "service_tests.json",
  "measurements.json",
  "performance.json",
  "ev.json",
  "obfcm.json",
  "calibration_metadata.json",
  "dataset_sources.json",
  "audit.json",
  "report.html",
] as const;
export type PackageFileName = (typeof PACKAGE_FILES)[number];

export type PackageInput = Partial<Record<PackageFileName, string | null>>;

export async function buildEvidencePackage(
  sessionId: string,
  sourceId: string,
  input: PackageInput,
): Promise<EvidencePackage> {
  const createdAt = new Date().toISOString();
  const files: EvidenceFile[] = [];
  const omitted: { name: string; reason: string }[] = [];

  for (const name of PACKAGE_FILES) {
    const content = input[name];
    if (content == null || content.trim().length === 0) {
      omitted.push({ name, reason: "NO REAL SOURCE DATA FOR THIS FILE" });
      continue;
    }
    files.push({
      name,
      content,
      createdAt,
      sessionId,
      sourceId,
      checksum: await sha256Hex(new TextEncoder().encode(content)),
    });
  }

  const manifestObject = {
    createdAt,
    sessionId,
    sourceId,
    fileCount: files.length,
    files: files.map((file) => ({ name: file.name, bytes: file.content.length, sha256: file.checksum })),
    omitted,
  };
  const manifest = JSON.stringify(manifestObject, null, 2);
  const manifestHash = await sha256Hex(new TextEncoder().encode(manifest));
  return { createdAt, sessionId, files, omitted, manifest, manifestHash };
}

/** Downloads the package as individual files plus SHA256_MANIFEST.json. */
export function downloadEvidencePackage(pkg: EvidencePackage) {
  if (typeof window === "undefined") return;
  const entries = [
    ...pkg.files.map((file) => ({ name: file.name, content: file.content })),
    { name: "SHA256_MANIFEST.json", content: pkg.manifest },
  ];
  for (const entry of entries) {
    const blob = new Blob([entry.content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pkg.sessionId.slice(0, 8)}-${entry.name}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

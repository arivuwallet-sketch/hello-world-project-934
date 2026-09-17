import { sha256Hex } from "./persist";
export type ReportOrigin = "MEASURED" | "ECU REPORTED" | "CALCULATED" | "USER ENTERED" | "HISTORICAL";
export interface ReportDatum { label: string; value: string; origin: ReportOrigin; source: string; timestamp?: number; raw?: string }
export interface SignedReport { mode: "CUSTOMER" | "ENGINEERING"; generatedAt: number; softwareVersion: string; vehicle: string; vin: string | null; technician: string; data: ReportDatum[]; datasetVersions: string[]; hardware: string; limitations: string[]; hash: string; signature: string | null }
export async function createSignedReport(input: Omit<SignedReport, "generatedAt" | "hash" | "signature">, signer?: string): Promise<SignedReport> {
  const base = { ...input, generatedAt: Date.now() };
  const hash = await sha256Hex(new TextEncoder().encode(JSON.stringify(base)));
  return { ...base, hash, signature: signer?.trim() ? `${signer.trim()} · ${hash.slice(0, 16)}` : null };
}
export function customerData(data: ReportDatum[]) { return data.filter((d) => !d.raw).map((d) => ({ ...d, source: d.origin === "ECU REPORTED" ? "Vehicle controller" : d.source })); }
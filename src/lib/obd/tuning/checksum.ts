/**
 * Extensible ECU checksum architecture. Algorithms are registered only where the
 * layout is legitimately documented for that ECU. Nothing is guessed, and this
 * module must never be used to defeat ECU security.
 */
export interface ChecksumRegion {
  name: string;
  start: number;
  end: number;
  storedAt: number;
  width: 2 | 4;
}

export interface ChecksumAlgorithm {
  id: string;
  ecuFamily: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  regions: ChecksumRegion[];
  /** Sum-based algorithms only; no security or seed-key material. */
  kind: "sum16" | "sum32";
}

export type ChecksumStatus = "VALID" | "CHECKSUM ERROR" | "INSUFFICIENT INFORMATION";

export interface ChecksumResult {
  status: ChecksumStatus;
  region: string;
  calculated: number | null;
  stored: number | null;
}

const registry = new Map<string, ChecksumAlgorithm>();

export function registerChecksumAlgorithm(algorithm: ChecksumAlgorithm) {
  registry.set(algorithm.id, algorithm);
}

export function listChecksumAlgorithms() {
  return [...registry.values()];
}

export function findChecksumAlgorithm(ecuFamily: string | null) {
  if (!ecuFamily) return null;
  return [...registry.values()].find((entry) => entry.ecuFamily === ecuFamily) ?? null;
}

function readStored(view: DataView, region: ChecksumRegion) {
  return region.width === 2 ? view.getUint16(region.storedAt, false) : view.getUint32(region.storedAt, false);
}

function sumRegion(bytes: Uint8Array, region: ChecksumRegion, mask: number) {
  let sum = 0;
  for (let index = region.start; index < region.end; index += 1) sum = (sum + (bytes[index] as number)) % mask;
  return sum;
}

/** Returns INSUFFICIENT INFORMATION when no documented algorithm exists. */
export function verifyChecksums(bytes: Uint8Array, algorithm: ChecksumAlgorithm | null): ChecksumResult[] {
  if (!algorithm) return [{ status: "INSUFFICIENT INFORMATION", region: "—", calculated: null, stored: null }];
  const mask = algorithm.kind === "sum16" ? 0x10000 : 0x100000000;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return algorithm.regions.map((region) => {
    if (region.end > bytes.byteLength || region.storedAt + region.width > bytes.byteLength) {
      return { status: "INSUFFICIENT INFORMATION" as ChecksumStatus, region: region.name, calculated: null, stored: null };
    }
    const calculated = sumRegion(bytes, region, mask);
    const stored = readStored(view, region);
    return {
      status: calculated === stored ? "VALID" : "CHECKSUM ERROR",
      region: region.name,
      calculated,
      stored,
    };
  });
}

export function applyChecksums(bytes: Uint8Array, algorithm: ChecksumAlgorithm): Uint8Array {
  const copy = new Uint8Array(bytes);
  const view = new DataView(copy.buffer);
  const mask = algorithm.kind === "sum16" ? 0x10000 : 0x100000000;
  for (const region of algorithm.regions) {
    if (region.end > copy.byteLength || region.storedAt + region.width > copy.byteLength) {
      throw new Error("INSUFFICIENT INFORMATION: checksum region outside file");
    }
    const calculated = sumRegion(copy, region, mask);
    if (region.width === 2) view.setUint16(region.storedAt, calculated, false);
    else view.setUint32(region.storedAt, calculated >>> 0, false);
  }
  return copy;
}

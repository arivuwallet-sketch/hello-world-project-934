/**
 * Module 124 — secure evidence chain.
 *
 * Every significant evidence object is hashed and linked to the previous one.
 * Nothing is overwritten: a changed object surfaces as EVIDENCE MODIFIED.
 */
import { loadRecords, newId, saveRecords, sha256Hex } from "./persist";

export type EvidenceKind =
  | "DIAGNOSTIC SNAPSHOT"
  | "REPORT"
  | "CALIBRATION FILE"
  | "PROGRAMMING RECORD"
  | "MEASUREMENT CAPTURE"
  | "TEST RESULT"
  | "EVIDENCE PACKAGE";

export interface EvidenceObject {
  id: string;
  kind: EvidenceKind;
  timestamp: string;
  sessionId: string | null;
  source: string;
  operator: string;
  operation: string;
  /** SHA-256 over the serialized content at creation time. */
  contentHash: string;
  hash: string;
  previousHash: string | null;
  /** Set when a later object supersedes this one; the original is kept. */
  supersededBy: string | null;
}

const KEY = "obd.evidenceChain";

export function loadEvidenceChain(): EvidenceObject[] {
  return loadRecords<EvidenceObject>(KEY);
}

function linkPayload(entry: Omit<EvidenceObject, "hash">) {
  return JSON.stringify([
    entry.id,
    entry.kind,
    entry.timestamp,
    entry.sessionId,
    entry.source,
    entry.operator,
    entry.operation,
    entry.contentHash,
    entry.previousHash,
  ]);
}

export async function appendEvidence(input: {
  kind: EvidenceKind;
  sessionId: string | null;
  source: string;
  operator: string;
  operation: string;
  content: string;
}): Promise<EvidenceObject> {
  const chain = loadEvidenceChain();
  const previous = chain[0] ?? null;
  const contentHash = await sha256Hex(new TextEncoder().encode(input.content));
  const base: Omit<EvidenceObject, "hash"> = {
    id: newId(),
    kind: input.kind,
    timestamp: new Date().toISOString(),
    sessionId: input.sessionId,
    source: input.source,
    operator: input.operator,
    operation: input.operation,
    contentHash,
    previousHash: previous?.hash ?? null,
    supersededBy: null,
  };
  const hash = await sha256Hex(new TextEncoder().encode(linkPayload(base)));
  const entry: EvidenceObject = { ...base, hash };
  saveRecords(KEY, [entry, ...chain].slice(0, 2000));
  return entry;
}

export type EvidenceObjectState = "VERIFIED" | "EVIDENCE MODIFIED" | "CHAIN BROKEN";

/** Compares stored content against the recorded hash without altering history. */
export async function verifyEvidenceObject(
  entry: EvidenceObject,
  content: string,
): Promise<EvidenceObjectState> {
  const contentHash = await sha256Hex(new TextEncoder().encode(content));
  return contentHash === entry.contentHash ? "VERIFIED" : "EVIDENCE MODIFIED";
}

export async function verifyEvidenceChain(
  chain = loadEvidenceChain(),
): Promise<{ state: "VERIFIED" | "CHAIN BROKEN" | "EMPTY"; brokenAt: string | null }> {
  if (chain.length === 0) return { state: "EMPTY", brokenAt: null };
  let previousHash: string | null = null;
  for (const entry of [...chain].reverse()) {
    if (entry.previousHash !== previousHash) return { state: "CHAIN BROKEN", brokenAt: entry.timestamp };
    const { hash: _ignored, ...rest } = entry;
    const expected = await sha256Hex(new TextEncoder().encode(linkPayload({ ...rest, previousHash })));
    if (expected !== entry.hash) return { state: "CHAIN BROKEN", brokenAt: entry.timestamp };
    previousHash = entry.hash;
  }
  return { state: "VERIFIED", brokenAt: null };
}

/** Marks an object as superseded instead of replacing it. */
export function supersedeEvidence(originalId: string, replacementId: string) {
  const chain = loadEvidenceChain();
  saveRecords(
    KEY,
    chain.map((entry) => (entry.id === originalId ? { ...entry, supersededBy: replacementId } : entry)),
  );
}

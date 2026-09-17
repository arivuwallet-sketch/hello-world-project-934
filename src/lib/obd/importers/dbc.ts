import type { DatasetProvenance } from "../provenance";

/**
 * Minimal, declarative DBC reader for CAN databases such as commaai/opendbc (MIT).
 *
 * Only message and signal declarations are read. Nothing is executed, nothing is guessed:
 * a signal that does not parse cleanly is skipped and reported, never approximated.
 */
export interface CanSignalDefinition {
  id: string;
  name: string;
  canId: number;
  startBit: number;
  bitLength: number;
  littleEndian: boolean;
  signed: boolean;
  scale: number;
  offset: number;
  min: number | null;
  max: number | null;
  unit: string;
  message: string;
  messageLength: number;
}

export interface CanSignalDataset {
  provenance: DatasetProvenance;
  signals: CanSignalDefinition[];
}

export interface DbcParseResult {
  signals: CanSignalDefinition[];
  skipped: string[];
  messages: number;
}

const MAX_DBC_BYTES = 8 * 1024 * 1024;

const MESSAGE = /^BO_\s+(\d+)\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\s+(\S+)/;
const SIGNAL =
  /^SG_\s+([A-Za-z0-9_]+)\s*(?:M|m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]*)\|([^\]]*)\]\s*"([^"]*)"/;

function safeNumber(raw: string): number | null {
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : null;
}

export function parseDbc(text: string): DbcParseResult {
  if (new TextEncoder().encode(text).byteLength > MAX_DBC_BYTES) {
    throw new Error("DBC file exceeds the 8 MB import limit");
  }

  const signals: CanSignalDefinition[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let messages = 0;
  let currentId: number | null = null;
  let currentName = "";
  let currentLength = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("BO_")) {
      const match = MESSAGE.exec(line);
      if (!match) {
        currentId = null;
        skipped.push(line.slice(0, 80));
        continue;
      }
      const [, id, name, length] = match;
      const numericId = Number(id);
      if (!Number.isInteger(numericId)) {
        currentId = null;
        continue;
      }
      // DBC stores extended (29-bit) identifiers with the high bit set.
      currentId = numericId & 0x1fffffff;
      currentName = name ?? "";
      currentLength = Number(length ?? 0);
      messages += 1;
      continue;
    }

    if (!line.startsWith("SG_")) continue;
    if (currentId === null) {
      skipped.push(line.slice(0, 80));
      continue;
    }

    const match = SIGNAL.exec(line);
    if (!match) {
      skipped.push(line.slice(0, 80));
      continue;
    }
    const [, name, startBit, bitLength, byteOrder, sign, scaleRaw, offsetRaw, minRaw, maxRaw, unit] = match;
    const scale = safeNumber(scaleRaw ?? "");
    const offset = safeNumber(offsetRaw ?? "");
    const start = Number(startBit);
    const length = Number(bitLength);

    if (
      scale === null ||
      offset === null ||
      !Number.isInteger(start) ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > 64 ||
      start < 0 ||
      start > 511
    ) {
      skipped.push(line.slice(0, 80));
      continue;
    }

    const id = `can.${currentId.toString(16).toUpperCase()}.${name}`;
    if (seen.has(id)) {
      skipped.push(`Duplicate signal ${id}`);
      continue;
    }
    seen.add(id);

    signals.push({
      id,
      name: name ?? "",
      canId: currentId,
      startBit: start,
      bitLength: length,
      littleEndian: byteOrder === "1",
      signed: sign === "-",
      scale,
      offset,
      min: safeNumber(minRaw ?? ""),
      max: safeNumber(maxRaw ?? ""),
      unit: unit ?? "",
      message: currentName,
      messageLength: currentLength,
    });
  }

  if (signals.length === 0) throw new Error("No decodable signals found in this DBC file");
  return { signals, skipped, messages };
}

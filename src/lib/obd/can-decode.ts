import type { CanSignalDataset, CanSignalDefinition } from "./importers/dbc";

export interface DecodedCanSignal {
  name: string;
  value: number;
  unit: string;
  message: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  outOfRange: boolean;
}

/** Extracts an unsigned field from a payload. Little-endian follows the DBC bit numbering used by opendbc. */
function extractRaw(payload: number[], signal: CanSignalDefinition): number | null {
  const totalBits = payload.length * 8;
  let value = 0n;

  for (let index = 0; index < signal.bitLength; index += 1) {
    const bitPosition = signal.littleEndian
      ? signal.startBit + index
      : (() => {
          // Big-endian (Motorola): the start bit is the most significant bit and counts downward.
          const byteIndex = Math.floor(signal.startBit / 8);
          const bitInByte = signal.startBit % 8;
          const absolute = byteIndex * 8 + (7 - bitInByte) + index;
          const targetByte = Math.floor(absolute / 8);
          const targetBit = 7 - (absolute % 8);
          return targetByte * 8 + targetBit;
        })();

    if (bitPosition < 0 || bitPosition >= totalBits) return null;
    const byte = payload[Math.floor(bitPosition / 8)];
    if (byte === undefined) return null;
    const bit = (byte >> bitPosition % 8) & 1;
    value |= BigInt(bit) << BigInt(index);
  }

  return Number(value);
}

function applySign(raw: number, signal: CanSignalDefinition): number {
  if (!signal.signed) return raw;
  const half = 2 ** (signal.bitLength - 1);
  return raw >= half ? raw - 2 ** signal.bitLength : raw;
}

/**
 * Decodes one captured CAN frame against the imported databases.
 * Returns an empty array when no imported definition covers the frame — raw hex stays raw hex.
 */
export function decodeCanFrame(
  canId: number,
  payload: number[],
  datasets: CanSignalDataset[],
): DecodedCanSignal[] {
  const decoded: DecodedCanSignal[] = [];

  for (const dataset of datasets) {
    for (const signal of dataset.signals) {
      if (signal.canId !== canId) continue;
      const raw = extractRaw(payload, signal);
      if (raw === null) continue;
      const value = applySign(raw, signal) * signal.scale + signal.offset;
      if (!Number.isFinite(value)) continue;
      const outOfRange =
        (signal.min !== null && signal.max !== null && signal.min !== signal.max && (value < signal.min || value > signal.max)) ||
        false;
      decoded.push({
        name: signal.name,
        value,
        unit: signal.unit,
        message: signal.message,
        sourceName: dataset.provenance.sourceName,
        sourceUrl: dataset.provenance.sourceUrl,
        license: dataset.provenance.license,
        outOfRange,
      });
    }
  }

  return decoded;
}

/** Parses an ELM327 monitor line such as "7E8 03 41 0C 1A F8" into an id and payload. */
export function parseMonitorLine(line: string): { canId: number; payload: number[] } | null {
  const cleaned = line.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  const parts = cleaned.split(" ");
  const [idPart, ...rest] = parts;
  if (!idPart || rest.length === 0) return null;
  if (!/^[0-9A-Fa-f]{3,8}$/.test(idPart)) return null;
  const canId = Number.parseInt(idPart, 16);
  if (!Number.isFinite(canId)) return null;
  const payload: number[] = [];
  for (const token of rest) {
    if (!/^[0-9A-Fa-f]{2}$/.test(token)) return null;
    payload.push(Number.parseInt(token, 16));
  }
  return { canId, payload };
}

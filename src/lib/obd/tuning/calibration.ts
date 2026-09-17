import { newId, sha256Hex } from "../persist";

export type CalibrationRole = "ORIGINAL" | "MODIFIED";

export interface CalibrationFile {
  id: string;
  filename: string;
  hash: string;
  size: number;
  ecu: string | null;
  hardwareNumber: string | null;
  softwareNumber: string | null;
  calibrationId: string | null;
  vin: string | null;
  role: CalibrationRole;
  version: string;
  branch: string;
  revision: number;
  tags: string[];
  technician: string;
  notes: string;
  timestamp: number;
  /** Backup verification is only true after a real read-back comparison. */
  backupVerified: boolean;
}

export interface CalibrationImport {
  file: CalibrationFile;
  bytes: Uint8Array;
}

/** Builds a real calibration record from a real file. No metadata is invented. */
export async function importCalibrationFile(
  file: File,
  meta: {
    role: CalibrationRole;
    ecu?: string | null;
    hardwareNumber?: string | null;
    softwareNumber?: string | null;
    calibrationId?: string | null;
    vin?: string | null;
    version: string;
    branch: string;
    revision: number;
    technician: string;
    notes: string;
    tags?: string[];
  },
): Promise<CalibrationImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("INVALID RESPONSE: empty calibration file");
  const hash = await sha256Hex(bytes);
  return {
    bytes,
    file: {
      id: newId(),
      filename: file.name,
      hash,
      size: bytes.byteLength,
      ecu: meta.ecu ?? null,
      hardwareNumber: meta.hardwareNumber ?? null,
      softwareNumber: meta.softwareNumber ?? null,
      calibrationId: meta.calibrationId ?? null,
      vin: meta.vin ?? null,
      role: meta.role,
      version: meta.version,
      branch: meta.branch,
      revision: meta.revision,
      tags: meta.tags ?? [],
      technician: meta.technician,
      notes: meta.notes,
      timestamp: Date.now(),
      backupVerified: false,
    },
  };
}

export interface ByteDiffRange {
  offset: number;
  length: number;
  originalBytes: number[];
  modifiedBytes: number[];
}

export interface CalibrationDiff {
  comparableLength: number;
  sizeMismatch: boolean;
  changedByteCount: number;
  ranges: ByteDiffRange[];
  unchangedByteCount: number;
}

/** Byte-exact diff of two real binaries. */
export function diffCalibrations(original: Uint8Array, modified: Uint8Array): CalibrationDiff {
  const comparableLength = Math.min(original.byteLength, modified.byteLength);
  const ranges: ByteDiffRange[] = [];
  let changed = 0;
  let current: ByteDiffRange | null = null;
  for (let offset = 0; offset < comparableLength; offset += 1) {
    const a = original[offset] as number;
    const b = modified[offset] as number;
    if (a === b) {
      current = null;
      continue;
    }
    changed += 1;
    if (!current) {
      current = { offset, length: 0, originalBytes: [], modifiedBytes: [] };
      ranges.push(current);
    }
    current.length += 1;
    current.originalBytes.push(a);
    current.modifiedBytes.push(b);
  }
  return {
    comparableLength,
    sizeMismatch: original.byteLength !== modified.byteLength,
    changedByteCount: changed,
    ranges,
    unchangedByteCount: comparableLength - changed,
  };
}

export interface MapDefinition {
  id: string;
  name: string;
  category:
    | "Fuel"
    | "Ignition"
    | "Air"
    | "Boost"
    | "Torque"
    | "RPM"
    | "Thermal"
    | "Transmission";
  offset: number;
  rows: number;
  cols: number;
  bytesPerCell: 1 | 2;
  signed: boolean;
  scale: number;
  offsetValue: number;
  unit: string;
  min?: number;
  max?: number;
  rowAxis: number[];
  colAxis: number[];
  /** Where this definition came from; without it the map is not shown. */
  sourceName: string;
  sourceUrl: string;
  license: string;
}

export interface MapCell {
  row: number;
  col: number;
  raw: number;
  scaled: number;
}

/** Reads a table out of the real binary using an imported definition. */
export function readMap(bytes: Uint8Array, def: MapDefinition): MapCell[][] {
  const need = def.rows * def.cols * def.bytesPerCell;
  if (def.offset + need > bytes.byteLength) throw new Error("INVALID RESPONSE: map outside file bounds");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const table: MapCell[][] = [];
  for (let row = 0; row < def.rows; row += 1) {
    const line: MapCell[] = [];
    for (let col = 0; col < def.cols; col += 1) {
      const index = (row * def.cols + col) * def.bytesPerCell;
      const at = def.offset + index;
      const raw =
        def.bytesPerCell === 1
          ? def.signed
            ? view.getInt8(at)
            : view.getUint8(at)
          : def.signed
            ? view.getInt16(at, false)
            : view.getUint16(at, false);
      line.push({ row, col, raw, scaled: raw * def.scale + def.offsetValue });
    }
    table.push(line);
  }
  return table;
}

export function writeMapCell(
  bytes: Uint8Array,
  def: MapDefinition,
  row: number,
  col: number,
  scaledValue: number,
): Uint8Array {
  if (def.min != null && scaledValue < def.min) throw new Error("INVALID RESPONSE: below defined minimum");
  if (def.max != null && scaledValue > def.max) throw new Error("INVALID RESPONSE: above defined maximum");
  const raw = Math.round((scaledValue - def.offsetValue) / def.scale);
  const copy = new Uint8Array(bytes);
  const view = new DataView(copy.buffer);
  const at = def.offset + (row * def.cols + col) * def.bytesPerCell;
  if (at + def.bytesPerCell > copy.byteLength) throw new Error("INVALID RESPONSE: cell outside file bounds");
  if (def.bytesPerCell === 1) {
    if (def.signed) view.setInt8(at, raw);
    else view.setUint8(at, raw);
  } else if (def.signed) view.setInt16(at, raw, false);
  else view.setUint16(at, raw, false);
  return copy;
}

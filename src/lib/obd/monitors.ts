/**
 * Deep-scan decoding helpers — all values come straight off the vehicle bus.
 *
 *  - SAE J1979 readiness monitors           (Mode 01 PID 01 / PID 41)
 *  - Mode 06 on-board monitoring test results (MID / TID / UAS decoding)
 *  - Mode 05 oxygen sensor monitor test IDs   (non-CAN protocols)
 *  - Mode 09 vehicle information items
 *  - Per-ECU response splitting with ISO-TP reassembly (headers on)
 */

/* ------------------------------------------------------------------ */
/* Readiness monitors                                                  */
/* ------------------------------------------------------------------ */

export interface MonitorStatus {
  name: string;
  supported: boolean;
  /** true = test complete, false = not ready */
  complete: boolean;
}

export interface ReadinessResult {
  milOn: boolean;
  dtcCount: number;
  compressionIgnition: boolean;
  continuous: MonitorStatus[];
  nonContinuous: MonitorStatus[];
}

const CONTINUOUS = ["Misfire", "Fuel System", "Comprehensive Component"];

const SPARK_MONITORS = [
  "Catalyst",
  "Heated Catalyst",
  "Evaporative System",
  "Secondary Air System",
  "A/C Refrigerant",
  "Oxygen Sensor",
  "Oxygen Sensor Heater",
  "EGR / VVT System",
];

const DIESEL_MONITORS = [
  "NMHC Catalyst",
  "NOx / SCR Aftertreatment",
  "Reserved",
  "Boost Pressure",
  "Reserved",
  "Exhaust Gas Sensor",
  "PM Filter",
  "EGR / VVT System",
];

/** Decode Mode 01 PID 01 (since DTCs cleared) or PID 41 (this drive cycle). */
export function decodeReadiness(p: number[]): ReadinessResult | null {
  if (!p || p.length < 4) return null;
  const a = p[0] ?? 0;
  const b = p[1] ?? 0;
  const c = p[2] ?? 0;
  const d = p[3] ?? 0;
  const diesel = (b & 0x08) !== 0;

  const continuous: MonitorStatus[] = CONTINUOUS.map((name, i) => ({
    name,
    supported: (b & (1 << i)) !== 0,
    // incomplete bit is set when the test is NOT complete
    complete: (b & (1 << (i + 4))) === 0,
  }));

  const names = diesel ? DIESEL_MONITORS : SPARK_MONITORS;
  const nonContinuous: MonitorStatus[] = names.map((name, i) => ({
    name,
    supported: (c & (1 << i)) !== 0,
    complete: (d & (1 << i)) === 0,
  }));

  return {
    milOn: (a & 0x80) !== 0,
    dtcCount: a & 0x7f,
    compressionIgnition: diesel,
    continuous,
    nonContinuous: nonContinuous.filter((m) => m.name !== "Reserved"),
  };
}

/* ------------------------------------------------------------------ */
/* Mode 06 — on-board monitoring test results                          */
/* ------------------------------------------------------------------ */

export interface UasDef {
  unit: string;
  scale: number;
  signed: boolean;
  offset?: number;
}

/** SAE J1979 Unit and Scaling ID table (the entries ECUs actually use). */
export const UAS: Record<number, UasDef> = {
  0x01: { unit: "counts", scale: 1, signed: false },
  0x02: { unit: "%", scale: 0.001526, signed: false },
  0x03: { unit: "mV", scale: 0.122, signed: false },
  0x04: { unit: "V", scale: 0.001, signed: false },
  0x05: { unit: "V", scale: 0.01, signed: false },
  0x06: { unit: "mA", scale: 0.00390625, signed: false },
  0x07: { unit: "A", scale: 0.001, signed: false },
  0x08: { unit: "A", scale: 0.01, signed: false },
  0x09: { unit: "s", scale: 1, signed: false },
  0x0a: { unit: "ms", scale: 0.1, signed: false },
  0x0b: { unit: "ms", scale: 1, signed: false },
  0x0c: { unit: "s", scale: 1, signed: false },
  0x0d: { unit: "min", scale: 1, signed: false },
  0x0e: { unit: "ms", scale: 0.25, signed: false },
  0x0f: { unit: "ms", scale: 0.01, signed: false },
  0x10: { unit: "ms", scale: 1, signed: false },
  0x11: { unit: "°CA", scale: 0.01, signed: false },
  0x12: { unit: "rpm", scale: 0.25, signed: false },
  0x13: { unit: "g/s", scale: 0.01, signed: false },
  0x14: { unit: "g/s", scale: 1, signed: false },
  0x15: { unit: "Pa", scale: 1, signed: false },
  0x16: { unit: "kPa", scale: 0.0305, signed: false },
  0x17: { unit: "kPa", scale: 0.001, signed: false },
  0x18: { unit: "kPa", scale: 0.078, signed: false },
  0x19: { unit: "kPa", scale: 1, signed: false },
  0x1a: { unit: "°C", scale: 1, signed: true, offset: -40 },
  0x1b: { unit: "°C", scale: 0.1, signed: true },
  0x1c: { unit: "°C", scale: 0.01, signed: true },
  0x1d: { unit: "°C", scale: 0.001, signed: true },
  0x1e: { unit: "ratio", scale: 0.0000305, signed: false },
  0x1f: { unit: "ratio", scale: 0.000122, signed: false },
  0x20: { unit: "ratio", scale: 0.00781, signed: false },
  0x21: { unit: "ratio", scale: 1, signed: false },
  0x22: { unit: "Ω", scale: 0.1, signed: false },
  0x23: { unit: "Ω", scale: 1, signed: false },
  0x24: { unit: "kΩ", scale: 1, signed: false },
  0x25: { unit: "km", scale: 1, signed: false },
  0x26: { unit: "%", scale: 0.1, signed: false },
  0x27: { unit: "g", scale: 0.01, signed: false },
  0x28: { unit: "g", scale: 1, signed: false },
  0x29: { unit: "%", scale: 0.01, signed: false },
  0x2a: { unit: "lpm", scale: 0.001, signed: false },
  0x2b: { unit: "%", scale: 0.001526, signed: true },
  0x31: { unit: "mm", scale: 0.001, signed: false },
  0x32: { unit: "counts", scale: 1, signed: true },
  0x33: { unit: "%", scale: 0.003052, signed: false },
  0x34: { unit: "g/s", scale: 0.001, signed: false },
  0x81: { unit: "ratio", scale: 0.0000305, signed: true },
  0x8a: { unit: "V", scale: 0.001, signed: true },
  0xfc: { unit: "kPa", scale: 0.001, signed: false },
};

/** Well-known standardised Mode 06 monitor IDs (SAE J1979 Appendix E). */
export const MID_NAMES: Record<number, string> = {
  0x01: "O2 Sensor Monitor B1S1",
  0x02: "O2 Sensor Monitor B1S2",
  0x03: "O2 Sensor Monitor B1S3",
  0x04: "O2 Sensor Monitor B1S4",
  0x05: "O2 Sensor Monitor B2S1",
  0x06: "O2 Sensor Monitor B2S2",
  0x07: "O2 Sensor Monitor B2S3",
  0x08: "O2 Sensor Monitor B2S4",
  0x21: "Catalyst Monitor Bank 1",
  0x22: "Catalyst Monitor Bank 2",
  0x31: "EGR Monitor Bank 1",
  0x32: "EGR Monitor Bank 2",
  0x39: "VVT Monitor Bank 1",
  0x3a: "VVT Monitor Bank 2",
  0x3b: "EVAP Monitor (0.090\")",
  0x3c: "EVAP Monitor (0.040\")",
  0x3d: "EVAP Monitor (0.020\")",
  0x3e: "Purge Flow Monitor",
  0x41: "Oxygen Sensor Heater B1S1",
  0x42: "Oxygen Sensor Heater B1S2",
  0x43: "Oxygen Sensor Heater B1S3",
  0x44: "Oxygen Sensor Heater B1S4",
  0x45: "Oxygen Sensor Heater B2S1",
  0x46: "Oxygen Sensor Heater B2S2",
  0x51: "Heated Catalyst Monitor Bank 1",
  0x61: "Secondary Air Monitor 1",
  0x62: "Secondary Air Monitor 2",
  0x71: "Fuel System Monitor Bank 1",
  0x72: "Fuel System Monitor Bank 2",
  0x81: "Misfire General Data",
  0x82: "Misfire Cylinder 1 Data",
  0x83: "Misfire Cylinder 2 Data",
  0x84: "Misfire Cylinder 3 Data",
  0x85: "Misfire Cylinder 4 Data",
  0x86: "Misfire Cylinder 5 Data",
  0x87: "Misfire Cylinder 6 Data",
  0x88: "Misfire Cylinder 7 Data",
  0x89: "Misfire Cylinder 8 Data",
  0x8a: "Misfire Cylinder 9 Data",
  0x8b: "Misfire Cylinder 10 Data",
  0xa1: "PM Filter Monitor Bank 1",
  0xa2: "PM Filter Monitor Bank 2",
};

export const TID_NAMES: Record<number, string> = {
  0x01: "Rich-to-lean sensor threshold voltage",
  0x02: "Lean-to-rich sensor threshold voltage",
  0x03: "Low sensor voltage for switch time",
  0x04: "High sensor voltage for switch time",
  0x05: "Rich-to-lean switch time",
  0x06: "Lean-to-rich switch time",
  0x07: "Minimum voltage for test cycle",
  0x08: "Maximum voltage for test cycle",
  0x09: "Time between voltage transitions",
  0x0a: "Sensor period",
  0x0b: "Exponentially weighted misfire counts",
  0x0c: "Misfire counts this drive cycle",
  0x0d: "EWMA misfire counts previous cycles",
  0x80: "Manufacturer-defined test",
  0x81: "Manufacturer-defined test",
  0x82: "Manufacturer-defined test",
  0x83: "Manufacturer-defined test",
  0x84: "Manufacturer-defined test",
  0x85: "Manufacturer-defined test",
  0x86: "Manufacturer-defined test",
  0x87: "Manufacturer-defined test",
  0x88: "Manufacturer-defined test",
  0x8a: "Manufacturer-defined test",
  0x90: "Manufacturer-defined test",
  0x91: "Manufacturer-defined test",
  0x92: "Manufacturer-defined test",
  0xa0: "Manufacturer-defined test",
  0xb0: "Manufacturer-defined test",
};

export interface MonitorTest {
  mid: number;
  tid: number;
  midName: string;
  tidName: string;
  value: number;
  min: number | null;
  max: number | null;
  unit: string;
  passed: boolean | null;
  raw: string;
}

const s16 = (v: number) => (v > 0x7fff ? v - 0x10000 : v);

function scaled(raw: number, uas: UasDef) {
  const base = uas.signed ? s16(raw) : raw;
  return base * uas.scale + (uas.offset ?? 0);
}

const round = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(4)));

/**
 * Decode a CAN-format Mode 06 payload: repeating
 * [MID][TID][UAS][value hi][value lo][min hi][min lo][max hi][max lo].
 */
export function parseMode06(bytes: number[]): MonitorTest[] {
  const out: MonitorTest[] = [];
  for (let i = 0; i + 8 < bytes.length; i += 9) {
    const mid = bytes[i] ?? 0;
    const tid = bytes[i + 1] ?? 0;
    const uasId = bytes[i + 2] ?? 0;
    if (mid === 0 && tid === 0) continue;
    const rawVal = ((bytes[i + 3] ?? 0) << 8) | (bytes[i + 4] ?? 0);
    const rawMin = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
    const rawMax = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0);
    const uas = UAS[uasId] ?? { unit: "raw", scale: 1, signed: false };
    const value = round(scaled(rawVal, uas));
    const min = round(scaled(rawMin, uas));
    const max = round(scaled(rawMax, uas));
    const hasMin = rawMin !== 0 || rawMax !== 0;
    const passed = hasMin ? value >= min && value <= max : null;
    out.push({
      mid,
      tid,
      midName: MID_NAMES[mid] ?? `Manufacturer monitor 0x${mid.toString(16).toUpperCase()}`,
      tidName: TID_NAMES[tid] ?? `Test 0x${tid.toString(16).toUpperCase()}`,
      value,
      min: hasMin ? min : null,
      max: hasMin ? max : null,
      unit: uas.unit,
      passed,
      raw: bytes
        .slice(i, i + 9)
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" "),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Mode 09 — vehicle information                                       */
/* ------------------------------------------------------------------ */

export const MODE09_ITEMS: Record<string, string> = {
  "01": "VIN message count",
  "02": "Vehicle Identification Number",
  "03": "Calibration ID message count",
  "04": "Calibration Identification",
  "05": "CVN message count",
  "06": "Calibration Verification Number",
  "07": "In-use performance tracking message count",
  "08": "In-use performance tracking (spark)",
  "09": "ECU name message count",
  "0A": "ECU name",
  "0B": "In-use performance tracking (compression)",
};

/** IPT counter labels, in SAE order, for Mode 09 PID 08 / 0B. */
export const IPT_LABELS_SPARK = [
  "OBD monitoring conditions encountered",
  "Ignition cycle counter",
  "Catalyst bank 1 completion",
  "Catalyst bank 1 conditions",
  "Catalyst bank 2 completion",
  "Catalyst bank 2 conditions",
  "Primary O2 bank 1 completion",
  "Primary O2 bank 1 conditions",
  "Primary O2 bank 2 completion",
  "Primary O2 bank 2 conditions",
  "EGR completion",
  "EGR conditions",
  "AIR completion",
  "AIR conditions",
  "EVAP completion",
  "EVAP conditions",
];

export const IPT_LABELS_DIESEL = [
  "OBD monitoring conditions encountered",
  "Ignition cycle counter",
  "NMHC catalyst completion",
  "NMHC catalyst conditions",
  "NOx catalyst completion",
  "NOx catalyst conditions",
  "NOx adsorber completion",
  "NOx adsorber conditions",
  "PM filter completion",
  "PM filter conditions",
  "Exhaust gas sensor completion",
  "Exhaust gas sensor conditions",
  "EGR/VVT completion",
  "EGR/VVT conditions",
  "Boost pressure completion",
  "Boost pressure conditions",
  "Fuel system completion",
  "Fuel system conditions",
];

export function parseIpt(bytes: number[], diesel: boolean) {
  const labels = diesel ? IPT_LABELS_DIESEL : IPT_LABELS_SPARK;
  // first byte is the number of 16-bit counters that follow
  const data = bytes.length % 2 === 1 ? bytes.slice(1) : bytes;
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i + 1 < data.length && out.length < labels.length; i += 2) {
    out.push({
      label: labels[out.length] as string,
      value: ((data[i] ?? 0) << 8) | (data[i + 1] ?? 0),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Per-ECU response splitting (ATH1) with ISO-TP reassembly            */
/* ------------------------------------------------------------------ */

export interface EcuResponse {
  header: string;
  bytes: number[];
}

const NEG = /NO DATA|UNABLE|ERROR|STOPPED|SEARCHING|TIMEOUT|CAN ERROR|BUS|\?/i;

/**
 * Split a headers-on ELM327 reply into one byte array per responding module.
 * Handles CAN single frames (0x0n), first frames (0x1n) and consecutive
 * frames (0x2n), plus legacy protocols where every line carries a 3-byte header.
 */
export function splitByEcu(resp: string): EcuResponse[] {
  const map = new Map<string, number[]>();
  const expect = new Map<string, number>();
  for (const lineRaw of resp.split("\n")) {
    const line = lineRaw.trim();
    if (!line || NEG.test(line)) continue;
    const toks = line.match(/[0-9A-F]{2,3}/gi);
    if (!toks || toks.length < 2) continue;
    const header = (toks[0] as string).toUpperCase();
    const rest = toks.slice(1).map((t) => parseInt(t, 16));
    const pci = rest[0] ?? 0;
    const type = pci >> 4;
    let payload: number[];
    if (type === 0x0 && (pci & 0x0f) <= 7) {
      payload = rest.slice(1, 1 + (pci & 0x0f));
      expect.set(header, 0);
      map.set(header, payload);
      continue;
    } else if (type === 0x1) {
      const len = ((pci & 0x0f) << 8) | (rest[1] ?? 0);
      expect.set(header, len);
      payload = rest.slice(2);
      map.set(header, payload);
      continue;
    } else if (type === 0x2) {
      payload = rest.slice(1);
    } else {
      payload = rest;
    }
    const cur = map.get(header) ?? [];
    map.set(header, [...cur, ...payload]);
  }
  return [...map.entries()].map(([header, bytes]) => {
    const len = expect.get(header);
    return { header, bytes: len && len > 0 ? bytes.slice(0, len) : bytes };
  });
}

/** Context from the VIN-verified garage entry, used only to refine labels. */
export interface VehicleContext {
  make?: string | undefined;
  modelYear?: string | undefined;
  fuel?: string | undefined;
  engine?: string | undefined;
}

/** Conservative name for a standards-based OBD responder. */
export function ecuLabel(header: string, _ctx?: VehicleContext): string {
  const known: Record<string, string> = {
    "7E8": "Primary OBD responder",
  };
  return known[header] ?? `OBD responder ${header}`;
}

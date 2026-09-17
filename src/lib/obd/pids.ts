/** Wideband O2 sensor index, 1-8 (bank 1 sensors 1-4, then bank 2 sensors 1-4). */
export type O2Index = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type PidId =
  | "rpm"
  | "speed"
  | "coolant"
  | "intakeTemp"
  | "throttle"
  | "stft1"
  | "ltft1"
  | "stft2"
  | "ltft2"
  | "map"
  | "maf"
  | "o2b1s1"
  | "o2b1s2"
  | "fuelLevel"
  | "voltage"
  | "timing"
  | "engineLoad"
  | "runtime"
  | "ambient"
  | "fuelPressure"
  | "baro"
  | "oilTemp"
  | "fuelRate"
  | "catB1S1"
  | "catB2S1"
  | "catB1S2"
  | "catB2S2"
  | "absLoad"
  | "relThrottle"
  | "pedalD"
  | "pedalE"
  | "hybridLife"
  | `lambda${O2Index}`
  | `wbCur${O2Index}`
  | `wbVolt${O2Index}`;

export interface PidDef {
  id: PidId;
  /** OBD-II Mode 01 PID, hex string without mode */
  pid: string;
  label: string;
  short: string;
  unit: string;
  min: number;
  max: number;
  /** number of data bytes expected */
  bytes: number;
  decode: (b: number[]) => number;
  /** green band for the gauge, optional */
  nominal?: [number, number];
  decimals?: number;
}

const c = (v: number, d = 0) => Number(v.toFixed(d));

export const PIDS: PidDef[] = [
  {
    id: "rpm",
    pid: "0C",
    label: "Engine Speed",
    short: "RPM",
    unit: "rpm",
    min: 0,
    max: 8000,
    bytes: 2,
    nominal: [600, 4000],
    decode: (b) => c(((b[0] ?? 0) * 256 + (b[1] ?? 0)) / 4),
  },
  {
    id: "speed",
    pid: "0D",
    label: "Vehicle Speed",
    short: "Speed",
    unit: "km/h",
    min: 0,
    max: 255,
    bytes: 1,
    decode: (b) => b[0] ?? 0,
  },
  {
    id: "coolant",
    pid: "05",
    label: "Coolant Temp",
    short: "Coolant",
    unit: "°C",
    min: -40,
    max: 150,
    bytes: 1,
    nominal: [70, 105],
    decode: (b) => (b[0] ?? 0) - 40,
  },
  {
    id: "intakeTemp",
    pid: "0F",
    label: "Intake Air Temp",
    short: "IAT",
    unit: "°C",
    min: -40,
    max: 120,
    bytes: 1,
    decode: (b) => (b[0] ?? 0) - 40,
  },
  {
    id: "throttle",
    pid: "11",
    label: "Throttle Position",
    short: "Throttle",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
  {
    id: "engineLoad",
    pid: "04",
    label: "Calculated Load",
    short: "Load",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
  {
    id: "stft1",
    pid: "06",
    label: "Short Fuel Trim B1",
    short: "STFT B1",
    unit: "%",
    min: -100,
    max: 99,
    bytes: 1,
    nominal: [-10, 10],
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) - 128) * (100 / 128), 1),
  },
  {
    id: "ltft1",
    pid: "07",
    label: "Long Fuel Trim B1",
    short: "LTFT B1",
    unit: "%",
    min: -100,
    max: 99,
    bytes: 1,
    nominal: [-10, 10],
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) - 128) * (100 / 128), 1),
  },
  {
    id: "stft2",
    pid: "08",
    label: "Short Fuel Trim B2",
    short: "STFT B2",
    unit: "%",
    min: -100,
    max: 99,
    bytes: 1,
    nominal: [-10, 10],
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) - 128) * (100 / 128), 1),
  },
  {
    id: "ltft2",
    pid: "09",
    label: "Long Fuel Trim B2",
    short: "LTFT B2",
    unit: "%",
    min: -100,
    max: 99,
    bytes: 1,
    nominal: [-10, 10],
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) - 128) * (100 / 128), 1),
  },
  {
    id: "map",
    pid: "0B",
    label: "Manifold Pressure",
    short: "MAP",
    unit: "kPa",
    min: 0,
    max: 255,
    bytes: 1,
    decode: (b) => b[0] ?? 0,
  },
  {
    id: "maf",
    pid: "10",
    label: "Mass Air Flow",
    short: "MAF",
    unit: "g/s",
    min: 0,
    max: 400,
    bytes: 2,
    decimals: 2,
    decode: (b) => c(((b[0] ?? 0) * 256 + (b[1] ?? 0)) / 100, 2),
  },
  {
    id: "o2b1s1",
    pid: "14",
    label: "O2 Sensor B1S1",
    short: "O2 B1S1",
    unit: "V",
    min: 0,
    max: 1.275,
    bytes: 2,
    decimals: 3,
    nominal: [0.1, 0.9],
    decode: (b) => c((b[0] ?? 0) / 200, 3),
  },
  {
    id: "o2b1s2",
    pid: "15",
    label: "O2 Sensor B1S2",
    short: "O2 B1S2",
    unit: "V",
    min: 0,
    max: 1.275,
    bytes: 2,
    decimals: 3,
    nominal: [0.1, 0.9],
    decode: (b) => c((b[0] ?? 0) / 200, 3),
  },
  {
    id: "fuelLevel",
    pid: "2F",
    label: "Fuel Level",
    short: "Fuel",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
  {
    id: "voltage",
    pid: "42",
    label: "Module Voltage",
    short: "Battery",
    unit: "V",
    min: 0,
    max: 18,
    bytes: 2,
    decimals: 2,
    nominal: [13.2, 14.8],
    decode: (b) => c(((b[0] ?? 0) * 256 + (b[1] ?? 0)) / 1000, 2),
  },
  {
    id: "timing",
    pid: "0E",
    label: "Timing Advance",
    short: "Timing",
    unit: "°",
    min: -64,
    max: 64,
    bytes: 1,
    decimals: 1,
    decode: (b) => c((b[0] ?? 0) / 2 - 64, 1),
  },
  {
    id: "ambient",
    pid: "46",
    label: "Ambient Air Temp",
    short: "Ambient",
    unit: "°C",
    min: -40,
    max: 80,
    bytes: 1,
    decode: (b) => (b[0] ?? 0) - 40,
  },
  {
    id: "fuelPressure",
    pid: "0A",
    label: "Fuel Pressure",
    short: "Fuel Press",
    unit: "kPa",
    min: 0,
    max: 765,
    bytes: 1,
    decode: (b) => (b[0] ?? 0) * 3,
  },
  {
    id: "baro",
    pid: "33",
    label: "Barometric Pressure",
    short: "Baro",
    unit: "kPa",
    min: 0,
    max: 255,
    bytes: 1,
    decode: (b) => b[0] ?? 0,
  },
  {
    id: "runtime",
    pid: "1F",
    label: "Run Time Since Start",
    short: "Runtime",
    unit: "s",
    min: 0,
    max: 65535,
    bytes: 2,
    decode: (b) => (b[0] ?? 0) * 256 + (b[1] ?? 0),
  },
];

/* ---------------- additional SAE J1979 Mode 01 PIDs ---------------- */

const EXTRA: PidDef[] = [
  {
    id: "oilTemp",
    pid: "5C",
    label: "Engine Oil Temp",
    short: "Oil Temp",
    unit: "°C",
    min: -40,
    max: 215,
    bytes: 1,
    nominal: [80, 115],
    decode: (b) => (b[0] ?? 0) - 40,
  },
  {
    id: "fuelRate",
    pid: "5E",
    label: "Engine Fuel Rate",
    short: "Fuel Rate",
    unit: "L/h",
    min: 0,
    max: 100,
    bytes: 2,
    decimals: 2,
    decode: (b) => c(((b[0] ?? 0) * 256 + (b[1] ?? 0)) / 20, 2),
  },
  {
    id: "absLoad",
    pid: "43",
    label: "Absolute Load Value",
    short: "Abs Load",
    unit: "%",
    min: 0,
    max: 400,
    bytes: 2,
    decimals: 1,
    decode: (b) => c((((b[0] ?? 0) * 256 + (b[1] ?? 0)) * 100) / 255, 1),
  },
  {
    id: "relThrottle",
    pid: "45",
    label: "Relative Throttle Position",
    short: "Rel Throttle",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
  {
    id: "pedalD",
    pid: "49",
    label: "Accelerator Pedal D",
    short: "Pedal D",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
  {
    id: "pedalE",
    pid: "4A",
    label: "Accelerator Pedal E",
    short: "Pedal E",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
  {
    id: "hybridLife",
    pid: "5B",
    label: "Hybrid Battery Remaining Life",
    short: "HV Batt",
    unit: "%",
    min: 0,
    max: 100,
    bytes: 1,
    decimals: 1,
    nominal: [40, 100],
    decode: (b) => c(((b[0] ?? 0) * 100) / 255, 1),
  },
];

/* Catalyst temperatures, PIDs 3C-3F: °C = ((A*256+B)/10) - 40 */
const CAT_PIDS: { id: PidId; pid: string; label: string; short: string }[] = [
  { id: "catB1S1", pid: "3C", label: "Catalyst Temp B1S1", short: "Cat B1S1" },
  { id: "catB2S1", pid: "3D", label: "Catalyst Temp B2S1", short: "Cat B2S1" },
  { id: "catB1S2", pid: "3E", label: "Catalyst Temp B1S2", short: "Cat B1S2" },
  { id: "catB2S2", pid: "3F", label: "Catalyst Temp B2S2", short: "Cat B2S2" },
];

for (const cat of CAT_PIDS) {
  EXTRA.push({
    id: cat.id,
    pid: cat.pid,
    label: cat.label,
    short: cat.short,
    unit: "°C",
    min: -40,
    max: 1200,
    bytes: 2,
    decimals: 1,
    nominal: [400, 800],
    decode: (b) => c(((b[0] ?? 0) * 256 + (b[1] ?? 0)) / 10 - 40, 1),
  });
}

/*
 * Wideband O2 / air-fuel sensors.
 * PIDs 24-2B: A,B = equivalence ratio (lambda) = (A*256+B)/32768
 *             C,D = sensor current = ((C*256+D)/256) - 128 mA
 * PIDs 34-3B: A,B = equivalence ratio, C,D = sensor voltage = (C*256+D)/8192 V
 * Most 2008+ vehicles report air-fuel data only here, not on PIDs 14/15.
 */
const bank = (i: number) => (i <= 4 ? 1 : 2);
const sens = (i: number) => (i <= 4 ? i : i - 4);

for (let i = 1 as number; i <= 8; i++) {
  const tag = `B${bank(i)}S${sens(i)}`;
  const currentPid = (0x23 + i).toString(16).toUpperCase().padStart(2, "0"); // 24..2B
  const voltPid = (0x33 + i).toString(16).toUpperCase().padStart(2, "0"); // 34..3B
  EXTRA.push({
    id: `lambda${i as O2Index}`,
    pid: currentPid,
    label: `Lambda ${tag} (equivalence ratio)`,
    short: `λ ${tag}`,
    unit: "λ",
    min: 0,
    max: 2,
    bytes: 4,
    decimals: 3,
    nominal: [0.97, 1.03],
    decode: (b) => c(((b[0] ?? 0) * 256 + (b[1] ?? 0)) / 32768, 3),
  });
  EXTRA.push({
    id: `wbCur${i as O2Index}`,
    pid: currentPid,
    label: `Wideband O2 Current ${tag}`,
    short: `O2 I ${tag}`,
    unit: "mA",
    min: -128,
    max: 128,
    bytes: 4,
    decimals: 3,
    nominal: [-1, 1],
    decode: (b) => c(((b[2] ?? 0) * 256 + (b[3] ?? 0)) / 256 - 128, 3),
  });
  EXTRA.push({
    id: `wbVolt${i as O2Index}`,
    pid: voltPid,
    label: `Wideband O2 Voltage ${tag}`,
    short: `O2 V ${tag}`,
    unit: "V",
    min: 0,
    max: 8,
    bytes: 4,
    decimals: 3,
    nominal: [3.1, 3.5],
    decode: (b) => c(((b[2] ?? 0) * 256 + (b[3] ?? 0)) / 8192, 3),
  });
}

PIDS.push(...EXTRA);

export const PID_BY_ID: Record<string, PidDef> = Object.fromEntries(
  PIDS.map((p) => [p.id, p]),
);

/** PIDs shown on the main gauge cluster, in order. */
export const DASH_PIDS: PidId[] = [
  "rpm",
  "speed",
  "coolant",
  "voltage",
  "throttle",
  "engineLoad",
  "intakeTemp",
  "maf",
];

export const GRAPH_PIDS: PidId[] = ["rpm", "speed", "coolant", "throttle", "maf", "voltage"];

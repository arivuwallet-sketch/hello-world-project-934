import type { DeclarativeFormula, SignalDefinition } from "../datasets";

/**
 * Reader for OBDb signal-set JSON (github.com/OBDb, per make/model repositories, and OBDb/SAEJ1979).
 *
 * OBDb describes each signal with a hex command and bit-level formatting. Only shapes this reader
 * fully understands are converted; everything else is reported as unconvertible rather than
 * approximated into a plausible-looking formula.
 */
export interface ObdbImportResult {
  signals: SignalDefinition[];
  unconvertible: string[];
}

interface ObdbFormat {
  bix?: number;
  len?: number;
  max?: number;
  min?: number;
  mul?: number;
  div?: number;
  add?: number;
  unit?: string;
  sign?: boolean;
}

interface ObdbSignal {
  id?: string;
  name?: string;
  path?: string;
  suggestedMetric?: string;
  fmt?: ObdbFormat;
}

interface ObdbCommand {
  hdr?: string;
  cmd?: Record<string, string>;
  signals?: ObdbSignal[];
}

const UNITS: Record<string, string> = {
  celsius: "°C",
  kilometers: "km",
  kilometersPerHour: "km/h",
  revolutionsPerMinute: "rpm",
  percent: "%",
  volts: "V",
  kilopascal: "kPa",
  grams: "g",
  gramsPerSecond: "g/s",
  seconds: "s",
  minutes: "min",
  hours: "h",
  liters: "L",
  litersPerHour: "L/h",
  kilowatts: "kW",
  kilowattHours: "kWh",
  amperes: "A",
  degrees: "°",
  newtonMeters: "Nm",
  unitless: "",
};

function unitFor(format: ObdbFormat): string {
  if (!format.unit) return "";
  return UNITS[format.unit] ?? format.unit;
}

/** Converts an OBDb byte/bit format into one of the declarative formulas this app can evaluate. */
function formulaFor(format: ObdbFormat): DeclarativeFormula | null {
  const bitIndex = format.bix;
  const length = format.len;
  if (!Number.isInteger(bitIndex) || !Number.isInteger(length)) return null;
  if (bitIndex === undefined || length === undefined) return null;
  if (bitIndex % 8 !== 0) return null; // Sub-byte packing is not converted rather than guessed.
  const byte = bitIndex / 8;
  const multiplier = (format.mul ?? 1) / (format.div ?? 1);
  const offset = format.add ?? 0;

  if (length === 8) {
    if (multiplier === 1 && offset === 0) return { operation: "identity", byte };
    if (multiplier === 1) return { operation: "offset", byte, offset };
    return { operation: "scale", byte, multiplier, offset };
  }
  if (length === 16) {
    return { operation: "uint16", highByte: byte, lowByte: byte + 1, divisor: 1 / multiplier, offset };
  }
  return null;
}

function commandHex(command: ObdbCommand): { mode: number; pid: string } | null {
  const cmd = command.cmd;
  if (!cmd) return null;
  const [service, payload] = Object.entries(cmd)[0] ?? [];
  if (!service || typeof payload !== "string") return null;
  const mode = Number.parseInt(service, 16);
  if (!Number.isInteger(mode) || mode < 1 || mode > 0xff) return null;
  if (!/^[0-9A-Fa-f]{2,8}$/.test(payload)) return null;
  return { mode, pid: payload.toUpperCase() };
}

export function parseObdbSignalSet(text: string, vehicle?: { make?: string; model?: string }): ObdbImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OBDb signal set is not valid JSON");
  }
  const root = parsed as { commands?: ObdbCommand[] };
  if (!Array.isArray(root.commands)) throw new Error("OBDb signal set has no commands array");

  const signals: SignalDefinition[] = [];
  const unconvertible: string[] = [];
  const seen = new Set<string>();

  for (const command of root.commands) {
    const hex = commandHex(command);
    if (!hex) {
      unconvertible.push("Command with an unrecognised service/PID pair");
      continue;
    }
    for (const signal of command.signals ?? []) {
      const rawId = signal.id ?? signal.name;
      if (!rawId) {
        unconvertible.push("Signal without an identifier");
        continue;
      }
      const format = signal.fmt ?? {};
      const formula = formulaFor(format);
      if (!formula) {
        unconvertible.push(`${rawId}: bit layout not convertible without guessing`);
        continue;
      }
      const id = rawId.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 100);
      if (seen.has(id)) {
        unconvertible.push(`${rawId}: duplicate identifier`);
        continue;
      }
      seen.add(id);
      const bytes = (format.len ?? 8) / 8;
      signals.push({
        id,
        name: signal.name ?? rawId,
        mode: hex.mode,
        pid: hex.pid,
        bytes: Math.max(1, Math.round(bytes)),
        unit: unitFor(format),
        ...(format.min === undefined ? {} : { min: format.min }),
        ...(format.max === undefined ? {} : { max: format.max }),
        formula,
        ...(command.hdr ? { ecu: command.hdr.toUpperCase() } : {}),
        ...(vehicle ? { vehicle } : {}),
      });
    }
  }

  if (signals.length === 0) throw new Error("No convertible signals found in this OBDb signal set");
  return { signals, unconvertible };
}

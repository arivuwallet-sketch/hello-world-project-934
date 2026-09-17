import type { DeclarativeFormula, SignalDefinition } from "../datasets";

/**
 * Reader for Torque Pro CSV PID files — the format used by community EV work such as
 * peternixon/MG-EV-OBD-PID (MG ZS EV) and most Team-BHP / forum-shared PID lists.
 *
 * Torque stores an arbitrary expression per PID (e.g. "((A*256)+B)/4"). Executing that string
 * is not acceptable here, so only expressions matching a known declarative shape are imported;
 * anything else is reported and left out.
 */
export interface TorqueImportResult {
  signals: SignalDefinition[];
  unconvertible: string[];
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current.trim());
  return fields;
}

/** Recognised Torque expressions, mapped onto declarative formulas. A/B are the first two payload bytes. */
function formulaFor(expression: string): { formula: DeclarativeFormula; bytes: number } | null {
  const expr = expression.replace(/\s+/g, "");
  if (!expr) return null;

  if (/^A$/i.test(expr)) return { formula: { operation: "identity", byte: 0 }, bytes: 1 };

  let match = /^A([-+])(\d+(?:\.\d+)?)$/i.exec(expr);
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    return { formula: { operation: "offset", byte: 0, offset: sign * Number(match[2]) }, bytes: 1 };
  }

  match = /^A\*(\d+(?:\.\d+)?)$/i.exec(expr);
  if (match) return { formula: { operation: "scale", byte: 0, multiplier: Number(match[1]) }, bytes: 1 };

  match = /^A\/(\d+(?:\.\d+)?)$/i.exec(expr);
  if (match) {
    const divisor = Number(match[1]);
    if (divisor === 0) return null;
    return { formula: { operation: "scale", byte: 0, multiplier: 1 / divisor }, bytes: 1 };
  }

  match = /^\(?A\*(\d+(?:\.\d+)?)\)?([-+])(\d+(?:\.\d+)?)$/i.exec(expr);
  if (match) {
    const sign = match[2] === "-" ? -1 : 1;
    return {
      formula: { operation: "scale", byte: 0, multiplier: Number(match[1]), offset: sign * Number(match[3]) },
      bytes: 1,
    };
  }

  if (/^\(?\(?A\*256\)?\+B\)?$/i.test(expr)) {
    return { formula: { operation: "uint16", highByte: 0, lowByte: 1 }, bytes: 2 };
  }

  match = /^\(?\(?A\*256\)?\+B\)?\/(\d+(?:\.\d+)?)$/i.exec(expr);
  if (match) {
    const divisor = Number(match[1]);
    if (divisor === 0) return null;
    return { formula: { operation: "uint16", highByte: 0, lowByte: 1, divisor }, bytes: 2 };
  }

  match = /^\(?\(?A\*256\)?\+B\)?\*(\d+(?:\.\d+)?)$/i.exec(expr);
  if (match) {
    const multiplier = Number(match[1]);
    if (multiplier === 0) return null;
    return { formula: { operation: "uint16", highByte: 0, lowByte: 1, divisor: 1 / multiplier }, bytes: 2 };
  }

  return null;
}

export function parseTorqueCsv(text: string, vehicle?: { make?: string; model?: string }): TorqueImportResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("Torque CSV contains no PID rows");

  const header = splitCsvLine(lines[0] ?? "").map((field) => field.toLowerCase());
  const columnOf = (...names: string[]) => {
    for (const name of names) {
      const index = header.findIndex((field) => field.includes(name));
      if (index >= 0) return index;
    }
    return -1;
  };

  const nameColumn = columnOf("name");
  const pidColumn = columnOf("modeandpid", "pid");
  const equationColumn = columnOf("equation", "formula");
  const unitColumn = columnOf("unit");
  const minColumn = columnOf("min");
  const maxColumn = columnOf("max");
  const headerColumn = columnOf("header", "hdr");

  if (nameColumn < 0 || pidColumn < 0 || equationColumn < 0) {
    throw new Error("Torque CSV must contain name, ModeAndPID and equation columns");
  }

  const signals: SignalDefinition[] = [];
  const unconvertible: string[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const name = fields[nameColumn] ?? "";
    const modeAndPid = (fields[pidColumn] ?? "").replace(/\s+/g, "").toUpperCase();
    const equation = fields[equationColumn] ?? "";
    if (!name || !/^[0-9A-F]{4,10}$/.test(modeAndPid)) {
      unconvertible.push(`${name || line.slice(0, 40)}: unrecognised mode/PID`);
      continue;
    }

    const mode = Number.parseInt(modeAndPid.slice(0, 2), 16);
    const pid = modeAndPid.slice(2);
    const converted = formulaFor(equation);
    if (!converted || !Number.isInteger(mode)) {
      unconvertible.push(`${name}: equation "${equation}" not convertible without executing it`);
      continue;
    }

    const id = name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 100);
    if (seen.has(id)) {
      unconvertible.push(`${name}: duplicate identifier`);
      continue;
    }
    seen.add(id);

    const min = Number(fields[minColumn] ?? "");
    const max = Number(fields[maxColumn] ?? "");
    const ecu = (fields[headerColumn] ?? "").replace(/\s+/g, "").toUpperCase();

    signals.push({
      id,
      name,
      mode,
      pid,
      bytes: converted.bytes,
      unit: fields[unitColumn] ?? "",
      ...(Number.isFinite(min) ? { min } : {}),
      ...(Number.isFinite(max) ? { max } : {}),
      formula: converted.formula,
      ...(/^[0-9A-F]{3,8}$/.test(ecu) ? { ecu } : {}),
      ...(vehicle ? { vehicle } : {}),
    });
  }

  if (signals.length === 0) throw new Error("No convertible PID rows found in this Torque CSV");
  return { signals, unconvertible };
}

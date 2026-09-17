import type { SignalDefinition } from "../datasets";
import { parseObdbSignalSet } from "./obdb";
import { parseTorqueCsv } from "./torque";

/**
 * Reader for the EV PID sets published at github.com/iternio/ev-obd-pids (Apache-2.0).
 *
 * That repository collects per-brand PID lists in more than one shape, so this reader accepts
 * either the Torque-style CSV rows or an OBDb-style JSON signal set and routes to the matching
 * declarative parser. Nothing is inferred for a brand that is not in the imported file.
 */
export interface EvImportResult {
  signals: SignalDefinition[];
  unconvertible: string[];
  detectedFormat: "torque-csv" | "obdb-json";
}

export function parseEvPidFile(
  text: string,
  fileName: string,
  vehicle?: { make?: string; model?: string },
): EvImportResult {
  const looksJson = fileName.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{");
  if (looksJson) {
    const result = parseObdbSignalSet(text, vehicle);
    return { ...result, detectedFormat: "obdb-json" };
  }
  const result = parseTorqueCsv(text, vehicle);
  return { ...result, detectedFormat: "torque-csv" };
}

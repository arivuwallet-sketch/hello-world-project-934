import type { DeclarativeFormula, SignalDataset, SignalDefinition } from "./datasets";
import { validateProvenance } from "./provenance";

const MAX_DATASET_BYTES = 5 * 1024 * 1024;
const PID = /^[0-9A-F]{2,8}$/;

function validFormula(value: unknown): value is DeclarativeFormula {
  if (!value || typeof value !== "object") return false;
  const formula = value as Record<string, unknown>;
  return ["identity", "offset", "scale", "uint16"].includes(String(formula["operation"]));
}

function validSignal(value: unknown): value is SignalDefinition {
  if (!value || typeof value !== "object") return false;
  const signal = value as Record<string, unknown>;
  return (
    typeof signal["id"] === "string" &&
    /^[a-z0-9._-]{1,100}$/i.test(signal["id"]) &&
    typeof signal["name"] === "string" &&
    Number.isInteger(signal["mode"]) &&
    Number(signal["mode"]) >= 1 &&
    Number(signal["mode"]) <= 0xff &&
    typeof signal["pid"] === "string" &&
    PID.test(signal["pid"].toUpperCase()) &&
    Number.isInteger(signal["bytes"]) &&
    Number(signal["bytes"]) > 0 &&
    Number(signal["bytes"]) <= 4095 &&
    typeof signal["unit"] === "string" &&
    validFormula(signal["formula"])
  );
}

export function loadDatasetJson(text: string): SignalDataset {
  if (new TextEncoder().encode(text).byteLength > MAX_DATASET_BYTES) {
    throw new Error("Dataset exceeds the 5 MB import limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Dataset is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Dataset must be an object");
  const dataset = parsed as Partial<SignalDataset>;
  if (!validateProvenance(dataset.provenance)) throw new Error("Dataset provenance is incomplete");
  if (!Array.isArray(dataset.signals) || !dataset.signals.every(validSignal)) {
    throw new Error("Dataset contains an invalid signal definition");
  }
  const ids = new Set<string>();
  for (const signal of dataset.signals) {
    if (ids.has(signal.id)) throw new Error(`Duplicate signal identifier: ${signal.id}`);
    ids.add(signal.id);
  }
  return { provenance: dataset.provenance, signals: dataset.signals };
}
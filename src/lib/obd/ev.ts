import type { ResolvedSignal } from "./datasets";
import type { DatasetRegistry } from "./dataset-registry";

/**
 * EV signals are dataset-driven only. Nothing here contains a PID, formula or
 * value: this is purely the vocabulary the UI can display *if* an imported,
 * provenance-checked definition supplies it for the selected vehicle/ECU.
 */
export const EV_SECTIONS = [
  "Battery",
  "Cells",
  "Thermal",
  "Charging",
  "Motor",
  "Inverter",
  "Contactors",
  "Health",
  "Energy",
] as const;

export type EvSection = (typeof EV_SECTIONS)[number];

export interface EvSignalSlot {
  id: string;
  label: string;
  section: EvSection;
}

export const EV_SIGNAL_SLOTS: EvSignalSlot[] = [
  { id: "ev.soc", label: "State of charge", section: "Battery" },
  { id: "ev.pack.voltage", label: "Pack voltage", section: "Battery" },
  { id: "ev.pack.current", label: "Pack current", section: "Battery" },
  { id: "ev.pack.power", label: "Pack power", section: "Battery" },
  { id: "ev.pack.limit.charge", label: "Charge power limit", section: "Battery" },
  { id: "ev.pack.limit.discharge", label: "Discharge power limit", section: "Battery" },
  { id: "ev.cell.voltage", label: "Cell voltage", section: "Cells" },
  { id: "ev.cell.voltage.min", label: "Minimum cell voltage", section: "Cells" },
  { id: "ev.cell.voltage.max", label: "Maximum cell voltage", section: "Cells" },
  { id: "ev.cell.delta", label: "Cell delta", section: "Cells" },
  { id: "ev.temp.battery", label: "Battery temperature", section: "Thermal" },
  { id: "ev.temp.min", label: "Minimum temperature", section: "Thermal" },
  { id: "ev.temp.max", label: "Maximum temperature", section: "Thermal" },
  { id: "ev.charge.state", label: "Charging state", section: "Charging" },
  { id: "ev.charge.power", label: "Charging power", section: "Charging" },
  { id: "ev.charge.dc", label: "DC charging", section: "Charging" },
  { id: "ev.charge.ac", label: "AC charging", section: "Charging" },
  { id: "ev.motor.temp", label: "Motor temperature", section: "Motor" },
  { id: "ev.inverter", label: "Inverter data", section: "Inverter" },
  { id: "ev.contactor.state", label: "Contactor state", section: "Contactors" },
  { id: "ev.isolation", label: "Isolation state", section: "Contactors" },
  { id: "ev.soh", label: "State of health", section: "Health" },
  { id: "ev.energy", label: "Energy counters", section: "Energy" },
];

export function resolveEvSignal(id: string, signals: ResolvedSignal[]) {
  const match = signals.find((signal) => signal.definition.id === id);
  if (!match) throw new Error("SIGNAL DEFINITION UNAVAILABLE");
  if (!match.definition.vehicle?.make) throw new Error("VEHICLE DEPENDENT");
  return match;
}

export type EvSlotStatus =
  | { state: "AVAILABLE"; resolved: ResolvedSignal }
  | { state: "SIGNAL DEFINITION UNAVAILABLE" }
  | { state: "VEHICLE DEPENDENT" }
  | { state: "SIGNAL DEFINITION CONFLICT"; detail: string };

/** Availability is decided by the registry alone — never assumed. */
export function evSlotStatus(slot: EvSignalSlot, registry: DatasetRegistry): EvSlotStatus {
  let resolved: ResolvedSignal | null;
  try {
    resolved = registry.resolve(slot.id);
  } catch (error) {
    return { state: "SIGNAL DEFINITION CONFLICT", detail: (error as Error).message };
  }
  if (!resolved) return { state: "SIGNAL DEFINITION UNAVAILABLE" };
  if (!resolved.definition.vehicle?.make) return { state: "VEHICLE DEPENDENT" };
  return { state: "AVAILABLE", resolved };
}

export interface CellReading {
  index: number;
  volts: number;
  source: string;
  timestamp: number;
}

export interface CellSummary {
  count: number;
  min: CellReading;
  max: CellReading;
  deltaVolts: number;
}

/**
 * Summarises only cells the ECU actually reported. Gaps stay gaps — the array is
 * never padded to a nominal pack size.
 */
export function summariseCells(readings: CellReading[]): CellSummary | null {
  if (readings.length === 0) return null;
  let min = readings[0] as CellReading;
  let max = readings[0] as CellReading;
  for (const reading of readings) {
    if (reading.volts < min.volts) min = reading;
    if (reading.volts > max.volts) max = reading;
  }
  return { count: readings.length, min, max, deltaVolts: Number((max.volts - min.volts).toFixed(4)) };
}

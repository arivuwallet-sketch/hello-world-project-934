import type { ResolvedSignal } from "./datasets";

export function resolveEvSignal(id: string, signals: ResolvedSignal[]) {
  const match = signals.find((signal) => signal.definition.id === id);
  if (!match) throw new Error("SIGNAL DEFINITION UNAVAILABLE");
  if (!match.definition.vehicle?.make) throw new Error("VEHICLE DEPENDENT");
  return match;
}
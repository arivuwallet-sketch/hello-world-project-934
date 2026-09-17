import type { DatasetProvenance } from "../provenance";
import { validateProvenance } from "../provenance";
import { loadRecords, saveRecords } from "../persist";

export type ServiceKind = "SERVICE FUNCTION" | "ACTIVE TEST";
export interface ServiceDefinition {
  id: string;
  name: string;
  kind: ServiceKind;
  provenance: DatasetProvenance;
  applicability: { make: string; model?: string; yearFrom?: number; yearTo?: number; ecu: string; protocol: string };
  preconditions: string[];
  authorizationRequired: boolean;
  safetyWarning: string;
  request: string;
  positiveResponsePrefix: string;
}

const KEY = "obd.serviceDefinitions";
const HEX = /^(?:[0-9A-F]{2}){2,128}$/;

export function validateServiceDefinition(value: unknown): value is ServiceDefinition {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<ServiceDefinition>;
  return Boolean(
    d.id && d.name && (d.kind === "SERVICE FUNCTION" || d.kind === "ACTIVE TEST") &&
    validateProvenance(d.provenance) && d.applicability?.make && d.applicability.ecu &&
    d.applicability.protocol && Array.isArray(d.preconditions) && d.safetyWarning &&
    d.request && HEX.test(d.request) && d.positiveResponsePrefix && HEX.test(d.positiveResponsePrefix),
  );
}

export function loadServiceDefinitions(): ServiceDefinition[] {
  return loadRecords<ServiceDefinition>(KEY).filter(validateServiceDefinition);
}

export function importServiceDefinitions(text: string): ServiceDefinition[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || value.length === 0) throw new Error("SERVICE DEFINITION UNAVAILABLE");
  const definitions = value.filter(validateServiceDefinition);
  if (definitions.length !== value.length) throw new Error("INVALID RESPONSE: one or more service definitions are incomplete");
  const existing = loadServiceDefinitions();
  for (const definition of definitions) {
    const conflict = existing.find((item) => item.id === definition.id && item.provenance.checksum !== definition.provenance.checksum);
    if (conflict) throw new Error(`SIGNAL DEFINITION CONFLICT: ${conflict.provenance.sourceName} / ${definition.provenance.sourceName}`);
  }
  const merged = [...existing.filter((item) => !definitions.some((next) => next.id === item.id)), ...definitions];
  saveRecords(KEY, merged);
  return definitions;
}

export function definitionApplies(definition: ServiceDefinition, vehicle: { make: string; model: string; year: string }, ecu: string, protocol: string) {
  const year = Number(vehicle.year);
  const a = definition.applicability;
  return a.make.toLowerCase() === vehicle.make.toLowerCase() && (!a.model || a.model.toLowerCase() === vehicle.model.toLowerCase()) &&
    (!a.yearFrom || year >= a.yearFrom) && (!a.yearTo || year <= a.yearTo) && a.ecu.toUpperCase() === ecu.toUpperCase() &&
    protocol.toLowerCase().includes(a.protocol.toLowerCase());
}

export function validateServiceResponse(definition: ServiceDefinition, response: string) {
  const clean = response.replace(/[^0-9A-F]/gi, "").toUpperCase();
  if (/7F[0-9A-F]{4}/.test(clean)) return { result: "FAILED" as const, evidence: response };
  if (!clean.startsWith(definition.positiveResponsePrefix)) return { result: "UNCONFIRMED" as const, evidence: response };
  return { result: "SUCCESS" as const, evidence: response };
}
import { loadRecords, newId, saveRecords } from "./persist";

export interface ServiceRecord {
  id: string;
  vehicleId: string | null;
  service: string;
  date: string;
  mileageKm: number | null;
  technician: string;
  parts: string;
  ecuWork: string;
  calibrationVersion: string;
  findings: string;
  dtcs: string[];
  notes: string;
  createdAt: number;
}

const KEY = "obd.serviceHistory";

export function loadServiceRecords() {
  return loadRecords<ServiceRecord>(KEY);
}

export function saveServiceRecords(records: ServiceRecord[]) {
  saveRecords(KEY, records);
}

export function createServiceRecord(input: Omit<ServiceRecord, "id" | "createdAt">): ServiceRecord {
  return { ...input, id: newId(), createdAt: Date.now() };
}

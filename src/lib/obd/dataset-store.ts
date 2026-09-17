import type { SignalDataset } from "./datasets";
import type { CanSignalDataset } from "./importers/dbc";
import { loadRecords, saveRecords, sha256Hex } from "./persist";
import { validateProvenance } from "./provenance";
import { signalRegistry } from "./registry";

const OBD_KEY = "obd.importedDatasets";
const CAN_KEY = "obd.importedCanDatasets";

export function loadImportedObdDatasets(): SignalDataset[] {
  return loadRecords<SignalDataset>(OBD_KEY).filter(
    (dataset) => validateProvenance(dataset.provenance) && Array.isArray(dataset.signals),
  );
}

export function loadImportedCanDatasets(): CanSignalDataset[] {
  return loadRecords<CanSignalDataset>(CAN_KEY).filter(
    (dataset) => validateProvenance(dataset.provenance) && Array.isArray(dataset.signals),
  );
}

/** Keeps the previous entry for a source instead of replacing it, so an import history stays traceable. */
function withHistory<T extends { provenance: { sourceName: string; version?: string } }>(
  existing: T[],
  incoming: T,
): T[] {
  const superseded = existing.filter((dataset) => dataset.provenance.sourceName === incoming.provenance.sourceName);
  const others = existing.filter((dataset) => dataset.provenance.sourceName !== incoming.provenance.sourceName);
  const archived = superseded.map((dataset) => ({
    ...dataset,
    provenance: {
      ...dataset.provenance,
      sourceName: `${dataset.provenance.sourceName} (superseded ${dataset.provenance.version ?? dataset.provenance.sourceName})`,
    },
  }));
  return [incoming, ...archived, ...others];
}

export async function saveImportedObdDataset(dataset: SignalDataset, fileBytes: Uint8Array): Promise<SignalDataset> {
  if (!validateProvenance(dataset.provenance)) {
    throw new Error("Import rejected: source, source URL, licence and import date are all required");
  }
  const stored: SignalDataset = {
    ...dataset,
    provenance: {
      ...dataset.provenance,
      checksum: await sha256Hex(fileBytes),
      entryCount: dataset.signals.length,
    },
  };
  saveRecords(OBD_KEY, withHistory(loadImportedObdDatasets(), stored));
  try {
    signalRegistry().register(stored);
  } catch {
    // A definition for this source already exists in the registry — never silently overwrite it.
  }
  return stored;
}

export async function saveImportedCanDataset(
  dataset: CanSignalDataset,
  fileBytes: Uint8Array,
): Promise<CanSignalDataset> {
  if (!validateProvenance(dataset.provenance)) {
    throw new Error("Import rejected: source, source URL, licence and import date are all required");
  }
  const stored: CanSignalDataset = {
    ...dataset,
    provenance: {
      ...dataset.provenance,
      checksum: await sha256Hex(fileBytes),
      entryCount: dataset.signals.length,
    },
  };
  saveRecords(CAN_KEY, withHistory(loadImportedCanDatasets(), stored));
  return stored;
}

export function removeImportedObdDataset(sourceName: string) {
  saveRecords(
    OBD_KEY,
    loadImportedObdDatasets().filter((dataset) => dataset.provenance.sourceName !== sourceName),
  );
  signalRegistry().unregister(sourceName);
}

export function removeImportedCanDataset(sourceName: string) {
  saveRecords(
    CAN_KEY,
    loadImportedCanDatasets().filter((dataset) => dataset.provenance.sourceName !== sourceName),
  );
}

/** Re-registers everything imported in an earlier session. Call once, from the browser. */
export function restoreImportedDatasets() {
  for (const dataset of loadImportedObdDatasets()) {
    try {
      signalRegistry().register(dataset);
    } catch {
      // Already present.
    }
  }
}

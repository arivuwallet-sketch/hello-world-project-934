import type { SignalDataset } from "./datasets";

export const BUILT_IN_SOURCES: SignalDataset[] = [
  {
    provenance: {
      sourceName: "OBDb SAE J1979",
      sourceUrl: "https://github.com/OBDb/SAEJ1979",
      license: "CC BY-SA 4.0",
      importedAt: "2026-09-17T00:00:00.000Z",
      classification: "COMMUNITY",
      revision: "Repository main branch; exact standard revision not claimed",
      attribution: "OBDb contributors",
      format: "Built-in TypeScript definitions",
      entryCount: 0,
    },
    signals: [],
  },
  {
    provenance: {
      sourceName: "iternio ev-obd-pids",
      sourceUrl: "https://github.com/iternio/ev-obd-pids",
      license: "Apache-2.0",
      importedAt: "2026-09-17T00:00:00.000Z",
      classification: "COMMUNITY",
      revision: "Not imported — awaiting a vehicle-specific selection",
      attribution: "Iternio and community contributors",
      format: "External JSON repository",
      entryCount: 0,
    },
    signals: [],
  },
];
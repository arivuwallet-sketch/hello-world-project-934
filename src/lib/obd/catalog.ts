import type { DatasetClassification } from "./provenance";

export type CatalogUse = "IMPORTABLE DATA" | "REFERENCE ONLY" | "RESEARCH SOURCE" | "CODE REFERENCE";
export type CatalogFormat = "DBC" | "OBDb JSON" | "Torque CSV" | "Forum / thread" | "Documentation";

export interface CatalogEntry {
  id: string;
  name: string;
  url: string;
  license: string;
  attribution: string;
  classification: DatalogClassificationAlias;
  format: CatalogFormat;
  use: CatalogUse;
  covers: string;
  caveat: string;
}

type DatalogClassificationAlias = DatasetClassification;

/**
 * Curated list of the external references this project draws on. Presence here grants nothing:
 * a source only produces usable signals after its file is imported and validated, and every
 * imported signal keeps the licence and attribution recorded below.
 */
export const SOURCE_CATALOG: CatalogEntry[] = [
  {
    id: "opendbc",
    name: "commaai/opendbc",
    url: "https://github.com/commaai/opendbc",
    license: "MIT",
    attribution: "comma.ai and opendbc contributors",
    classification: "MANUFACTURER-SPECIFIC",
    format: "DBC",
    use: "IMPORTABLE DATA",
    covers: "Reverse-engineered CAN databases for Toyota, Hyundai/Kia, GM, VW, Subaru, Ford, Chrysler and more",
    caveat:
      "Import a DBC on the CAN Monitor to see decoded signal names instead of raw hex. Community reverse engineering, not OEM documentation — a mismatched platform or model year decodes wrongly.",
  },
  {
    id: "obdb",
    name: "OBDb signal sets",
    url: "https://github.com/OBDb",
    license: "Per-repository (commonly CC BY-SA 4.0 / MIT)",
    attribution: "OBDb contributors",
    classification: "VEHICLE-SPECIFIC",
    format: "OBDb JSON",
    use: "IMPORTABLE DATA",
    covers: "Per make/model/year OBD signal sets, extending coverage beyond the generic PID list",
    caveat: "Check the licence in the specific make/model repository before importing; it is recorded with the import.",
  },
  {
    id: "obdb-saej1979",
    name: "OBDb/SAEJ1979",
    url: "https://github.com/OBDb/SAEJ1979",
    license: "CC BY-SA 4.0",
    attribution: "OBDb contributors — attribution required, share-alike",
    classification: "COMMUNITY",
    format: "OBDb JSON",
    use: "IMPORTABLE DATA",
    covers: "Community re-implementation of the standard Mode 01/09 PID reference",
    caveat:
      "A community re-implementation, not the SAE J1979 standard text (which is copyrighted). No specific standard revision is claimed.",
  },
  {
    id: "iternio-ev",
    name: "iternio/ev-obd-pids",
    url: "https://github.com/iternio/ev-obd-pids",
    license: "Apache-2.0",
    attribution: "Iternio (A Better Routeplanner) and contributors",
    classification: "VEHICLE-SPECIFIC",
    format: "Torque CSV",
    use: "IMPORTABLE DATA",
    covers: "Consolidated EV PID sets per brand — state of charge, cell voltages, pack temperature, charge power",
    caveat: "Brand and firmware specific, community-verified only. EV signals stay unavailable until a matching set is imported.",
  },
  {
    id: "mg-zs-ev",
    name: "peternixon/MG-EV-OBD-PID",
    url: "https://github.com/peternixon/MG-EV-OBD-PID",
    license: "Repository licence applies — recorded at import",
    attribution: "Peter Nixon and MG EV community contributors",
    classification: "VEHICLE-SPECIFIC",
    format: "Torque CSV",
    use: "IMPORTABLE DATA",
    covers: "Working MG ZS EV PIDs (sold in India) — battery, charging and motor signals",
    caveat: "Reverse engineered by owners. Verify against your own car's responses before trusting a reading.",
  },
  {
    id: "mgevs-thread",
    name: "MG EVS forum — ZS EV CAN/OBD spreadsheets",
    url: "https://www.mgevs.com/threads/zs-ev-reverse-engineering-can-and-obd-spreadsheets.1998/",
    license: "Forum content — no redistribution licence",
    attribution: "MG EVS forum members",
    classification: "VEHICLE-SPECIFIC",
    format: "Forum / thread",
    use: "RESEARCH SOURCE",
    covers: "The decode spreadsheets behind the MG ZS EV PID work",
    caveat: "Read manually. Nothing from a forum post is imported automatically.",
  },
  {
    id: "obfcm-reference",
    name: "Anush-aj/obfcm",
    url: "https://github.com/Anush-aj/obfcm",
    license: "Repository licence applies",
    attribution: "Anush-aj",
    classification: "COMMUNITY",
    format: "Documentation",
    use: "CODE REFERENCE",
    covers: "A working OBFCM (Mode 09 InfoType 17) reader — the refuse-rather-than-invent split this app follows",
    caveat: "Used as an implementation reference. No data is taken from it.",
  },
  {
    id: "team-bhp",
    name: "Team-BHP — OBD on Indian cars",
    url: "https://www.team-bhp.com/forum/technical-stuff/20803-obd-board-diagnostics-indian-cars.html",
    license: "Forum content — no redistribution licence",
    attribution: "Team-BHP members",
    classification: "VEHICLE-SPECIFIC",
    format: "Forum / thread",
    use: "RESEARCH SOURCE",
    covers: "Indian-market specifics: which ECUs answer, OBD port locations, adapters owners found to work",
    caveat: "Knowledge to mine by hand. Never imported, never quoted as vehicle data.",
  },
  {
    id: "elm327-reference",
    name: "evrenonur/obd2-elm327-pid-reference",
    url: "https://github.com/evrenonur/obd2-elm327-pid-reference",
    license: "Repository licence applies",
    attribution: "evrenonur",
    classification: "COMMUNITY",
    format: "Documentation",
    use: "REFERENCE ONLY",
    covers: "AT commands, protocol behaviour and PID formulas collected in one place",
    caveat: "A cheat sheet for development, not a data source.",
  },
];

export type DatasetClassification =
  | "STANDARD"
  | "COMMUNITY"
  | "VEHICLE-SPECIFIC"
  | "MANUFACTURER-SPECIFIC";

export interface DatasetProvenance {
  sourceName: string;
  sourceUrl: string;
  license: string;
  importedAt: string;
  classification: DatasetClassification;
  version?: string;
  revision?: string;
  checksum?: string;
  attribution?: string;
  format?: string;
  originalFileName?: string;
  entryCount?: number;
}

export function validateProvenance(value: unknown): value is DatasetProvenance {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["sourceName"] === "string" &&
    item["sourceName"].trim().length > 0 &&
    typeof item["sourceUrl"] === "string" &&
    /^https:\/\//i.test(item["sourceUrl"]) &&
    typeof item["license"] === "string" &&
    item["license"].trim().length > 0 &&
    typeof item["importedAt"] === "string" &&
    !Number.isNaN(Date.parse(item["importedAt"])) &&
    ["STANDARD", "COMMUNITY", "VEHICLE-SPECIFIC", "MANUFACTURER-SPECIFIC"].includes(
      String(item["classification"]),
    )
  );
}
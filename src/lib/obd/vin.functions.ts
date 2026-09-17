import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const vinInput = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Enter a valid 17-character VIN"),
});

export interface VinDatabaseRecord {
  vin: string;
  manufacturer: string | null;
  make: string | null;
  model: string | null;
  modelYear: string | null;
  trim: string | null;
  series: string | null;
  vehicleType: string | null;
  bodyClass: string | null;
  engine: string | null;
  engineManufacturer: string | null;
  displacementLiters: string | null;
  cylinders: string | null;
  horsepower: string | null;
  fuelType: string | null;
  transmission: string | null;
  driveType: string | null;
  plant: string | null;
  errorCode: string;
  warning: string | null;
  source: "NHTSA vPIC";
}

interface VpicResult {
  VIN?: string;
  Manufacturer?: string;
  Make?: string;
  Model?: string;
  ModelYear?: string;
  Trim?: string;
  Series?: string;
  VehicleType?: string;
  BodyClass?: string;
  EngineModel?: string;
  EngineManufacturer?: string;
  DisplacementL?: string;
  EngineCylinders?: string;
  EngineHP?: string;
  FuelTypePrimary?: string;
  TransmissionStyle?: string;
  TransmissionSpeeds?: string;
  DriveType?: string;
  PlantCompanyName?: string;
  PlantCity?: string;
  PlantState?: string;
  PlantCountry?: string;
  ErrorCode?: string;
  ErrorText?: string;
}

interface VpicResponse {
  Results?: VpicResult[];
}

const cache = new Map<string, { expires: number; record: VinDatabaseRecord }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

function text(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "Not Applicable" ? normalized : null;
}

function joined(values: Array<string | null>, separator = ", ") {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present.join(separator) : null;
}

export const lookupVinDatabase = createServerFn({ method: "POST" })
  .inputValidator((data) => vinInput.parse(data))
  .handler(async ({ data }): Promise<VinDatabaseRecord> => {
    const cached = cache.get(data.vin);
    if (cached && cached.expires > Date.now()) return cached.record;

    const endpoint = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(data.vin)}?format=json`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new Error("The official VIN database is temporarily unavailable. Try again shortly.");
    }

    if (!response.ok) {
      throw new Error("The official VIN database could not complete this lookup.");
    }

    const payload = (await response.json()) as VpicResponse;
    const result = payload.Results?.[0];
    if (!result) throw new Error("No official vehicle record was returned for this VIN.");

    const transmission = joined(
      [text(result.TransmissionStyle), text(result.TransmissionSpeeds)],
      " · ",
    );
    const plant = joined([
      text(result.PlantCompanyName),
      text(result.PlantCity),
      text(result.PlantState),
      text(result.PlantCountry),
    ]);
    const warningText = text(result.ErrorText);
    const warning = result.ErrorCode === "0" ? null : warningText;

    const record: VinDatabaseRecord = {
      vin: text(result.VIN) ?? data.vin,
      manufacturer: text(result.Manufacturer),
      make: text(result.Make),
      model: text(result.Model),
      modelYear: text(result.ModelYear),
      trim: text(result.Trim),
      series: text(result.Series),
      vehicleType: text(result.VehicleType),
      bodyClass: text(result.BodyClass),
      engine: text(result.EngineModel),
      engineManufacturer: text(result.EngineManufacturer),
      displacementLiters: text(result.DisplacementL),
      cylinders: text(result.EngineCylinders),
      horsepower: text(result.EngineHP),
      fuelType: text(result.FuelTypePrimary),
      transmission,
      driveType: text(result.DriveType),
      plant,
      errorCode: result.ErrorCode ?? "",
      warning,
      source: "NHTSA vPIC",
    };

    cache.set(data.vin, { expires: Date.now() + CACHE_MS, record });
    return record;
  });
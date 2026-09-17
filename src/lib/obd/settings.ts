import { loadRecords, saveRecords } from "./persist";

export type UnitSystem = "metric" | "imperial";
export type ThemeMode = "technical-dark" | "light" | "night";

export interface AppSettings {
  units: UnitSystem;
  theme: ThemeMode;
  language: string;
  timeZone: string;
  dateFormat: "iso" | "locale";
  reducedMotion: boolean;
}

const KEY = "obd.settings";

export const DEFAULT_SETTINGS: AppSettings = {
  units: "metric",
  theme: "technical-dark",
  language: "en",
  timeZone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  dateFormat: "locale",
  reducedMotion: false,
};

export function loadSettings(): AppSettings {
  const [record] = loadRecords<AppSettings>(KEY);
  return record ? { ...DEFAULT_SETTINGS, ...record } : DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings) {
  saveRecords(KEY, [settings]);
}

const CONVERSIONS: Record<string, { unit: string; convert: (value: number) => number }> = {
  "km/h": { unit: "mph", convert: (value) => value * 0.621371 },
  km: { unit: "mi", convert: (value) => value * 0.621371 },
  "°C": { unit: "°F", convert: (value) => value * 1.8 + 32 },
  kPa: { unit: "psi", convert: (value) => value * 0.145038 },
  L: { unit: "gal", convert: (value) => value * 0.264172 },
  "L/h": { unit: "gal/h", convert: (value) => value * 0.264172 },
  "g/s": { unit: "lb/min", convert: (value) => value * 0.132277 },
  kW: { unit: "hp", convert: (value) => value * 1.34102 },
  Nm: { unit: "lb-ft", convert: (value) => value * 0.737562 },
};

/**
 * Converts a measured value for display. `null` stays `null` — an unavailable
 * value is never converted into a number.
 */
export function displayValue(
  value: number | null | undefined,
  unit: string,
  units: UnitSystem,
  digits = 1,
): { value: string | null; unit: string } {
  const conversion = CONVERSIONS[unit];
  if (value == null || !Number.isFinite(value)) {
    return { value: null, unit: units === "imperial" && conversion ? conversion.unit : unit };
  }
  if (units === "metric" || !conversion) return { value: value.toFixed(digits), unit };
  return { value: conversion.convert(value).toFixed(digits), unit: conversion.unit };
}

export function formatTimestamp(iso: string, settings: AppSettings): string {
  if (settings.dateFormat === "iso") return iso;
  try {
    return new Intl.DateTimeFormat(settings.language, {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: settings.timeZone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

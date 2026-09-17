/**
 * Vehicle make matching for the manual actuation console.
 *
 * Proprietary ECU addresses, DIDs, routine IDs and security algorithms vary by
 * model, year, engine, controller software and diagnostic session. None are
 * shipped here without a traceable manufacturer source.
 */

export interface MakeProfile {
  id: string;
  make: string;
  aliases: string[];
}

export const MAKE_PROFILES: MakeProfile[] = [
  { id: "vag", make: "Volkswagen / Audi / Škoda / SEAT", aliases: ["volkswagen", "vw", "audi", "skoda", "škoda", "seat", "cupra"] },
  { id: "bmw", make: "BMW / MINI", aliases: ["bmw", "mini"] },
  { id: "ford", make: "Ford", aliases: ["ford"] },
  { id: "gm", make: "GM / Vauxhall / Opel / Chevrolet", aliases: ["gm", "vauxhall", "opel", "chevrolet", "chevy", "cadillac", "buick"] },
  { id: "toyota", make: "Toyota / Lexus", aliases: ["toyota", "lexus", "scion", "daihatsu"] },
  { id: "honda", make: "Honda / Acura", aliases: ["honda", "acura"] },
  { id: "mercedes", make: "Mercedes-Benz", aliases: ["mercedes", "mercedes-benz", "benz", "smart"] },
  { id: "psa", make: "Peugeot / Citroën / DS / Renault / Dacia", aliases: ["peugeot", "citroen", "citroën", "ds", "renault", "dacia"] },
  { id: "hyundai", make: "Hyundai / Kia", aliases: ["hyundai", "kia", "genesis"] },
  { id: "volvo", make: "Volvo", aliases: ["volvo", "polestar"] },
  { id: "nissan", make: "Nissan / Infiniti", aliases: ["nissan", "infiniti", "datsun"] },
  { id: "mazda", make: "Mazda", aliases: ["mazda"] },
  { id: "subaru", make: "Subaru", aliases: ["subaru"] },
  { id: "stellantis", make: "Chrysler / Jeep / Dodge / RAM / Fiat / Alfa Romeo", aliases: ["chrysler", "jeep", "dodge", "ram", "fiat", "alfa", "alfa romeo", "lancia", "abarth"] },
  { id: "jlr", make: "Jaguar / Land Rover", aliases: ["jaguar", "land rover", "landrover", "range rover", "rover"] },
  { id: "maruti", make: "Maruti Suzuki / Suzuki", aliases: ["maruti", "suzuki"] },
  { id: "tata", make: "Tata Motors", aliases: ["tata"] },
  { id: "mahindra", make: "Mahindra", aliases: ["mahindra"] },
  { id: "other", make: "Other / unknown make", aliases: [] },
];

export function profileForMake(make: string): MakeProfile {
  const normalized = make.trim().toLowerCase();
  const fallback = MAKE_PROFILES[MAKE_PROFILES.length - 1];
  if (!fallback) return { id: "other", make: "Other / unknown make", aliases: [] };
  return MAKE_PROFILES.find((profile) => profile.aliases.some((alias) => normalized.includes(alias))) ?? fallback;
}
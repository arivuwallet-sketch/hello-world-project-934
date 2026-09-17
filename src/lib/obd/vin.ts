const WMI: Record<string, string> = {
  "1G1": "Chevrolet (USA)",
  "1G6": "Cadillac (USA)",
  "1FA": "Ford (USA)",
  "1FT": "Ford Truck (USA)",
  "1HG": "Honda (USA)",
  "1N4": "Nissan (USA)",
  "2T1": "Toyota (Canada)",
  "3VW": "Volkswagen (Mexico)",
  "4T1": "Toyota (USA)",
  "5YJ": "Tesla (USA)",
  JHM: "Honda (Japan)",
  JN1: "Nissan (Japan)",
  JTD: "Toyota (Japan)",
  JMZ: "Mazda (Japan)",
  KMH: "Hyundai (South Korea)",
  KNA: "Kia (South Korea)",
  MA1: "Mahindra (India)",
  MA3: "Suzuki / Maruti (India)",
  MAT: "Tata Motors (India)",
  MBH: "Suzuki / Maruti (India)",
  MEC: "Nissan (India)",
  MZB: "Mazda (Thailand)",
  SAL: "Land Rover (UK)",
  SAJ: "Jaguar (UK)",
  SHH: "Honda (UK)",
  TMB: "Skoda (Czechia)",
  VF1: "Renault (France)",
  VF3: "Peugeot (France)",
  VF7: "Citroen (France)",
  WAU: "Audi (Germany)",
  WBA: "BMW (Germany)",
  WDB: "Mercedes-Benz (Germany)",
  WDD: "Mercedes-Benz (Germany)",
  WP0: "Porsche (Germany)",
  WVW: "Volkswagen (Germany)",
  YV1: "Volvo (Sweden)",
  ZFA: "Fiat (Italy)",
  ZAR: "Alfa Romeo (Italy)",
};

const REGION: Record<string, string> = {
  A: "Africa",
  B: "Africa",
  C: "Africa",
  J: "Asia",
  K: "Asia",
  L: "Asia (China)",
  M: "Asia (India)",
  N: "Asia",
  P: "Asia",
  R: "Asia",
  S: "Europe",
  T: "Europe",
  V: "Europe",
  W: "Europe (Germany)",
  X: "Europe (Russia/CIS)",
  Y: "Europe (Nordic)",
  Z: "Europe (Italy)",
  "1": "North America (USA)",
  "2": "North America (Canada)",
  "3": "North America (Mexico)",
  "4": "North America (USA)",
  "5": "North America (USA)",
  "6": "Oceania",
  "7": "Oceania",
  "8": "South America",
  "9": "South America",
};

const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export interface VinDecoded {
  vin: string;
  valid: boolean;
  wmi: string;
  manufacturer: string;
  region: string;
  modelYear: string;
  plantCode: string;
  serial: string;
  checkDigitOk: boolean | null;
}

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function decodeVin(vinRaw: string): VinDecoded {
  const vin = vinRaw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  const valid = vin.length === 17;
  const wmi = vin.slice(0, 3);
  const yearChar = vin[9] ?? "";
  const yearIdx = YEAR_CODES.indexOf(yearChar);
  let modelYear = "Unknown";
  if (yearIdx >= 0) {
    const base = 1980 + yearIdx;
    const now = new Date().getFullYear();
    modelYear = base + 30 <= now + 1 ? String(base + 30) : String(base);
  }

  let checkDigitOk: boolean | null = null;
  if (valid) {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const ch = vin[i] as string;
      const val = /\d/.test(ch) ? Number(ch) : (TRANSLIT[ch] ?? 0);
      sum += val * (WEIGHTS[i] as number);
    }
    const rem = sum % 11;
    const expected = rem === 10 ? "X" : String(rem);
    checkDigitOk = vin[8] === expected;
  }

  return {
    vin,
    valid,
    wmi,
    manufacturer: WMI[wmi] ?? `Unlisted manufacturer (WMI ${wmi || "?"})`,
    region: REGION[vin[0] ?? ""] ?? "Unknown",
    modelYear,
    plantCode: vin[10] ?? "?",
    serial: vin.slice(11),
    checkDigitOk,
  };
}

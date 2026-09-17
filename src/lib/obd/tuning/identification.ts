import { parseUdsResponse } from "../uds";

/** Standard read-only identification DIDs (ISO 14229-1 Annex C). */
export const IDENTIFICATION_DIDS = {
  vin: 0xf190,
  ecuManufacturer: 0xf18a,
  ecuHardwareNumber: 0xf191,
  ecuSoftwareNumber: 0xf194,
  calibrationId: 0xf195,
  bootSoftware: 0xf180,
  ecuFamily: 0xf187,
} as const;

export type IdentificationField = keyof typeof IDENTIFICATION_DIDS;

export interface EcuIdentification {
  ecuAddress: string;
  protocol: string;
  /** Only fields the ECU actually returned. Absent = not readable, never guessed. */
  fields: Partial<Record<IdentificationField, string>>;
  supportedServices: number[];
  programmingCapability: "SUPPORTED" | "UNSUPPORTED BY ECU" | "UNKNOWN";
  memoryInfo: string | null;
  readAt: number;
}

const ASCII = /^[\x20-\x7e]+$/;

/** Decodes a 0x22 positive response for one DID. Throws instead of guessing. */
export function decodeDidResponse(bytes: number[], did: number): string {
  const response = parseUdsResponse(bytes);
  if (!response.positive) {
    throw new Error(`UDS ERROR: NRC 0x${(response.negativeResponseCode ?? 0).toString(16)}`);
  }
  if (response.requestService !== 0x22) throw new Error("INVALID RESPONSE");
  const high = response.payload[0];
  const low = response.payload[1];
  if (high == null || low == null) throw new Error("INVALID RESPONSE");
  if (((high << 8) | low) !== did) throw new Error("INVALID RESPONSE");
  const data = response.payload.slice(2);
  if (data.length === 0) throw new Error("DATA NOT AVAILABLE");
  const text = data
    .filter((byte) => byte !== 0x00)
    .map((byte) => String.fromCharCode(byte))
    .join("")
    .trim();
  if (!text || !ASCII.test(text)) {
    return data.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }
  return text;
}

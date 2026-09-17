/**
 * Module 108 — adapter identity, health and capability claim tracking.
 *
 * A capability has three independent facts: what the adapter (or its data
 * sheet) advertises, what we actually detected, and what real traffic
 * verified. They are never collapsed into a single boolean.
 */

export type ClaimState = "YES" | "NO" | "UNKNOWN";

export interface CapabilityClaim {
  capability: string;
  advertised: ClaimState;
  detected: ClaimState;
  verified: ClaimState;
  note: string;
}

export const CAPABILITY_LIST = [
  "OBD",
  "CAN",
  "CAN-FD",
  "ISO-TP",
  "UDS",
  "J2534",
  "DoIP",
  "BLE",
  "Bluetooth Classic",
  "USB",
  "Wi-Fi",
  "Vendor SDK",
  "Raw CAN",
] as const;

export type CapabilityName = (typeof CAPABILITY_LIST)[number];

export interface CapabilityEvidence {
  /** Adapter identity string actually returned by ATI/STI. */
  identity: string | null;
  transport: "serial" | "bluetooth" | "usb" | "wifi" | "native-bridge" | null;
  /** Protocol number the adapter reported after detection. */
  protocolCode: string | null;
  /** True only when a raw CAN monitor command produced real frames. */
  rawFramesObserved: boolean;
  /** True only when a multi-frame ISO-TP reassembly actually completed. */
  isotpObserved: boolean;
  /** True only when a UDS service returned a positive response. */
  udsObserved: boolean;
  /** True only when an authorised native bridge answered a probe. */
  nativeBridge: boolean;
  /** True when the adapter returned a real voltage reading. */
  voltageObserved: boolean;
}

function claim(
  capability: CapabilityName,
  advertised: ClaimState,
  detected: ClaimState,
  verified: ClaimState,
  note: string,
): CapabilityClaim {
  return { capability, advertised, detected, verified, note };
}

/**
 * Builds the capability table. Advertised state comes only from the identity
 * string the adapter itself returned — never from a product name we assumed.
 */
export function capabilityClaims(e: CapabilityEvidence): CapabilityClaim[] {
  const id = (e.identity ?? "").toUpperCase();
  const advertises = (needle: string): ClaimState =>
    e.identity === null ? "UNKNOWN" : id.includes(needle) ? "YES" : "UNKNOWN";
  const canDetected: ClaimState =
    e.protocolCode === null ? "UNKNOWN" : /^[6-9A-C]$/i.test(e.protocolCode) ? "YES" : "NO";
  const yn = (v: boolean): ClaimState => (v ? "YES" : "UNKNOWN");

  return [
    claim("OBD", advertises("ELM"), e.identity ? "YES" : "UNKNOWN", yn(Boolean(e.protocolCode)), "Verified once a mode 01 request was answered"),
    claim("CAN", "UNKNOWN", canDetected, canDetected === "YES" ? "YES" : "UNKNOWN", "Detected from the adapter's own protocol number"),
    claim("CAN-FD", advertises("STN"), "UNKNOWN", "NO", "No CAN-FD frame has been observed on this connection"),
    claim("ISO-TP", "UNKNOWN", yn(e.isotpObserved), yn(e.isotpObserved), "Verified only by a completed multi-frame reassembly"),
    claim("UDS", "UNKNOWN", yn(e.udsObserved), yn(e.udsObserved), "Verified only by a positive UDS response"),
    claim("J2534", yn(e.nativeBridge), yn(e.nativeBridge), yn(e.nativeBridge), "Requires an authorised native bridge; browsers cannot provide it"),
    claim("DoIP", "UNKNOWN", "UNKNOWN", "NO", "Requires an Ethernet/DoIP interface — not reachable from a browser transport"),
    claim("BLE", e.transport === "bluetooth" ? "YES" : "UNKNOWN", e.transport === "bluetooth" ? "YES" : "UNKNOWN", e.transport === "bluetooth" ? "YES" : "UNKNOWN", "Web Bluetooth connects to BLE adapters only"),
    claim("Bluetooth Classic", advertises("OBDLINK"), "UNKNOWN", "NO", "Classic SPP is unreachable from any browser — needs a local agent"),
    claim("USB", e.transport === "serial" ? "YES" : "UNKNOWN", e.transport === "serial" ? "YES" : "UNKNOWN", e.transport === "serial" ? "YES" : "UNKNOWN", "A Web Serial port was opened"),
    claim("Wi-Fi", "UNKNOWN", "UNKNOWN", "NO", "Wi-Fi adapters need a TCP socket — not available to browser code"),
    claim("Vendor SDK", "UNKNOWN", yn(e.nativeBridge), "NO", "No vendor SDK has answered a probe"),
    claim("Raw CAN", advertises("STN"), yn(e.rawFramesObserved), yn(e.rawFramesObserved), "Verified only by real frames arriving from a monitor command"),
  ];
}

export interface AdapterIdentity {
  field: string;
  value: string;
}

/**
 * Only fields the adapter actually returned appear with a value; everything
 * else is reported as unavailable rather than guessed from the device name.
 */
export function adapterIdentityRows(input: {
  name: string;
  version: string;
  transport: string | null;
  firmware: string | null;
  serialNumber: string | null;
  bluetoothAddress: string | null;
  usbIdentity: string | null;
  nativeBridge: boolean;
}): AdapterIdentity[] {
  const or = (v: string | null | undefined, fallback = "DATA UNAVAILABLE") =>
    v && v.trim().length > 0 ? v : fallback;
  return [
    { field: "Adapter name", value: or(input.name, "OBD ADAPTER NOT CONNECTED") },
    { field: "Identity response", value: or(input.version) },
    { field: "Manufacturer", value: "DATA UNAVAILABLE — not reported by ELM-class adapters" },
    { field: "Model", value: or(input.name) },
    { field: "Hardware version", value: "DATA UNAVAILABLE" },
    { field: "Firmware version", value: or(input.firmware) },
    { field: "Serial number", value: or(input.serialNumber) },
    { field: "Bluetooth address", value: or(input.bluetoothAddress, "UNSUPPORTED BY BROWSER") },
    { field: "USB identity", value: or(input.usbIdentity, "UNSUPPORTED BY BROWSER") },
    { field: "Driver information", value: input.transport ? `Browser ${input.transport} transport` : "DATA UNAVAILABLE" },
    { field: "Native API / J2534", value: input.nativeBridge ? "Bridge detected" : "UNSUPPORTED BY BROWSER" },
  ];
}

export interface LatencyStats {
  current: string;
  average: string;
  min: string;
  max: string;
  samples: number;
}

export function latencyStats(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { current: "DATA UNAVAILABLE", average: "DATA UNAVAILABLE", min: "DATA UNAVAILABLE", max: "DATA UNAVAILABLE", samples: 0 };
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    current: `${samples[samples.length - 1]!.toFixed(0)} ms`,
    average: `${(sum / samples.length).toFixed(0)} ms`,
    min: `${Math.min(...samples).toFixed(0)} ms`,
    max: `${Math.max(...samples).toFixed(0)} ms`,
    samples: samples.length,
  };
}

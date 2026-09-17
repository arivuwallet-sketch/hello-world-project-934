export type HardwareTransportKind = "serial" | "bluetooth" | "usb" | "wifi" | "native-bridge";

export interface HardwareCapabilities {
  rawCan: boolean | null;
  obd: boolean | null;
  uds: boolean | null;
  programming: boolean | null;
  voltage: boolean | null;
}

export interface HardwareDeviceInfo {
  name: string;
  transport: HardwareTransportKind;
  firmware: string | null;
}

export interface HardwareAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  isConnected(): boolean;
  getDeviceInfo(): Promise<HardwareDeviceInfo>;
  getCapabilities(): Promise<HardwareCapabilities>;
  sendCommand(command: string): Promise<string>;
  sendRaw(payload: Uint8Array): Promise<Uint8Array>;
  receive(): AsyncIterable<Uint8Array>;
  subscribe(listener: (payload: Uint8Array) => void): () => void;
  setProtocol(protocol: string): Promise<void>;
  getProtocol(): Promise<string | null>;
  getLatency(): number | null;
  getSignalStatus(): "AVAILABLE" | "STALE" | "UNAVAILABLE";
  getFirmwareInfo(): Promise<string | null>;
  getVoltage(): Promise<number | null>;
  startStream(): Promise<void>;
  stopStream(): Promise<void>;
}

export interface BrowserHardwareSupport {
  secureContext: boolean;
  serial: boolean;
  bluetooth: boolean;
  usb: boolean;
  reason: string | null;
}

export function detectBrowserHardwareSupport(): BrowserHardwareSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { secureContext: false, serial: false, bluetooth: false, usb: false, reason: "BROWSER API UNSUPPORTED" };
  }
  const support = {
    secureContext: window.isSecureContext,
    serial: "serial" in navigator,
    bluetooth: "bluetooth" in navigator,
    usb: "usb" in navigator,
  };
  return {
    ...support,
    reason: !support.secureContext || (!support.serial && !support.bluetooth && !support.usb)
      ? "BROWSER HARDWARE ACCESS UNSUPPORTED"
      : null,
  };
}
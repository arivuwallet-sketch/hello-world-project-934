/**
 * ELM327 / STN transport layer.
 *
 * Two browser transports are supported:
 *  - Web Serial  (USB-wired ELM327 / STN1110 adapters)  -> most reliable
 *  - Web Bluetooth (true BLE dongles exposing a UART service)
 *
 * Classic Bluetooth (SPP) dongles are unreachable from any browser.
 */

export type TransportKind = "serial" | "bluetooth";

export interface Transport {
  kind: TransportKind;
  name: string;
  write(data: string): Promise<void>;
  onData(cb: (chunk: string) => void): void;
  close(): Promise<void>;
  isOpen(): boolean;
}

/* ------------------------------------------------------------------ */
/* Serial                                                              */
/* ------------------------------------------------------------------ */

export function serialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function bluetoothSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function openSerial(baudRate = 38400): Promise<Transport> {
  const nav = navigator as unknown as { serial: any };
  const port = await nav.serial.requestPort();
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 4096 });

  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();
  const encoder = new TextEncoderStream();
  encoder.readable.pipeTo(port.writable).catch(() => {});
  const writer = encoder.writable.getWriter();

  let open = true;
  let handler: ((c: string) => void) | null = null;

  (async () => {
    try {
      while (open) {
        const { value, done } = await reader.read();
        if (done) break;
        const h = handler as ((c: string) => void) | null;
        if (value && h) h(value);
      }
    } catch {
      /* closed */
    }
    open = false;
  })();

  const info = port.getInfo?.() ?? {};
  const name =
    info.usbVendorId != null
      ? `USB adapter ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}`
      : "USB serial adapter";

  return {
    kind: "serial",
    name,
    isOpen: () => open,
    write: async (d) => {
      await writer.write(d);
    },
    onData: (cb) => {
      handler = cb;
    },
    close: async () => {
      open = false;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
      try {
        await port.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** UART-style services used by common BLE OBD dongles. */
const BLE_SERVICES = [
  0xfff0,
  0xffe0,
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // vLinker / LELink
];

export async function openBluetooth(): Promise<Transport> {
  const nav = navigator as unknown as { bluetooth: any };
  const device = await nav.bluetooth.requestDevice({
    filters: BLE_SERVICES.map((s) => ({ services: [s] })),
    optionalServices: BLE_SERVICES,
  });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();

  let writeChar: any = null;
  let notifyChar: any = null;
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (!writeChar && (ch.properties.write || ch.properties.writeWithoutResponse)) writeChar = ch;
      if (!notifyChar && ch.properties.notify) notifyChar = ch;
    }
    if (writeChar && notifyChar) break;
  }
  if (!writeChar || !notifyChar) {
    await server.disconnect();
    throw new Error(
      "This Bluetooth device does not expose a readable/writable UART service. Classic Bluetooth ELM327 clones cannot be used from a browser.",
    );
  }

  let handler: ((c: string) => void) | null = null;
  const dec = new TextDecoder();
  await notifyChar.startNotifications();
  notifyChar.addEventListener("characteristicvaluechanged", (e: any) => {
    const v: DataView = e.target.value;
    if (handler) handler(dec.decode(v));
  });

  let open = true;
  device.addEventListener("gattserverdisconnected", () => {
    open = false;
  });

  const enc = new TextEncoder();
  return {
    kind: "bluetooth",
    name: device.name || "BLE OBD adapter",
    isOpen: () => open && server.connected,
    write: async (d) => {
      const bytes = enc.encode(d);
      // BLE MTU-safe chunking
      for (let i = 0; i < bytes.length; i += 20) {
        const chunk = bytes.slice(i, i + 20);
        if (writeChar.writeValueWithoutResponse) await writeChar.writeValueWithoutResponse(chunk);
        else await writeChar.writeValue(chunk);
      }
    },
    onData: (cb) => {
      handler = cb;
    },
    close: async () => {
      open = false;
      try {
        await notifyChar.stopNotifications();
      } catch {
        /* ignore */
      }
      server.disconnect();
    },
  };
}

/* ------------------------------------------------------------------ */
/* ELM327 command layer                                                */
/* ------------------------------------------------------------------ */

export const PROTOCOLS: Record<string, string> = {
  "0": "Automatic",
  "1": "SAE J1850 PWM (41.6 kbit/s)",
  "2": "SAE J1850 VPW (10.4 kbit/s)",
  "3": "ISO 9141-2 (5 baud init)",
  "4": "ISO 14230-4 KWP2000 (5 baud init)",
  "5": "ISO 14230-4 KWP2000 (fast init)",
  "6": "ISO 15765-4 CAN (11 bit, 500 kbit/s)",
  "7": "ISO 15765-4 CAN (29 bit, 500 kbit/s)",
  "8": "ISO 15765-4 CAN (11 bit, 250 kbit/s)",
  "9": "ISO 15765-4 CAN (29 bit, 250 kbit/s)",
  A: "SAE J1939 CAN (29 bit, 250 kbit/s)",
  B: "User1 CAN",
  C: "User2 CAN",
};

export interface ObdLogEntry {
  ts: number;
  dir: "tx" | "rx";
  text: string;
}

export class Elm327 {
  private transport: Transport | null = null;
  private buffer = "";
  private pending: { resolve: (v: string) => void; timer: ReturnType<typeof setTimeout> } | null =
    null;
  private queue: Promise<unknown> = Promise.resolve();

  log: ObdLogEntry[] = [];
  onLog: ((e: ObdLogEntry) => void) | null = null;
  onStream: ((line: string) => void) | null = null;
  streaming = false;

  adapterName = "";
  adapterVersion = "";
  protocolCode = "";
  protocolName = "";

  get connected() {
    return !!this.transport && this.transport.isOpen();
  }

  get transportKind(): TransportKind | null {
    return this.transport?.kind ?? null;
  }

  private push(dir: "tx" | "rx", text: string) {
    const e = { ts: Date.now(), dir, text };
    this.log.push(e);
    if (this.log.length > 600) this.log.splice(0, this.log.length - 600);
    this.onLog?.(e);
  }

  async attach(t: Transport) {
    this.transport = t;
    this.adapterName = t.name;
    t.onData((chunk) => this.handleData(chunk));
  }

  private handleData(chunk: string) {
    this.buffer += chunk;
    if (this.streaming) {
      const parts = this.buffer.split(/\r|\n/);
      this.buffer = parts.pop() ?? "";
      for (const p of parts) {
        const line = p.trim();
        if (line) this.onStream?.(line);
      }
      if (this.buffer.includes(">")) {
        this.buffer = "";
      }
      return;
    }
    if (this.buffer.includes(">")) {
      const raw = this.buffer.slice(0, this.buffer.indexOf(">"));
      this.buffer = "";
      const text = raw.replace(/\r/g, "\n").trim();
      this.push("rx", text || "(no data)");
      const p = this.pending;
      this.pending = null;
      if (p) {
        clearTimeout(p.timer);
        p.resolve(text);
      }
    }
  }

  /** Send a raw command and wait for the '>' prompt. Serialised. */
  send(cmd: string, timeoutMs = 5000): Promise<string> {
    const run = async () => {
      if (!this.transport || !this.transport.isOpen()) throw new Error("Adapter not connected");
      this.push("tx", cmd);
      const result = new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          this.pending = null;
          this.push("rx", "TIMEOUT");
          resolve("TIMEOUT");
        }, timeoutMs);
        this.pending = { resolve, timer };
      });
      await this.transport.write(cmd + "\r");
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Reset and auto-detect the bus protocol, ELM327 ATSP0 style. */
  async initialise(onStep?: (s: string) => void): Promise<void> {
    onStep?.("Resetting adapter…");
    const id = await this.send("ATZ", 8000);
    this.adapterVersion = id.split("\n").filter(Boolean).pop() ?? "ELM327";
    await this.send("ATE0");
    await this.send("ATL0");
    await this.send("ATS0");
    await this.send("ATH0");
    onStep?.("Negotiating protocol (auto)…");
    await this.send("ATSP0");
    const probe = await this.send("0100", 12000);
    if (/UNABLE|ERROR|NO DATA|TIMEOUT|SEARCHING\.\.\.\s*$/i.test(probe) && !/41\s*00/i.test(probe)) {
      // retry once — first attempt after ATSP0 often only completes the search
      await this.send("0100", 12000);
    }
    const dpn = (await this.send("ATDPN")).replace(/[^0-9A-Ca-c]/g, "").slice(-1).toUpperCase();
    this.protocolCode = dpn || "?";
    this.protocolName = PROTOCOLS[dpn] ?? "Unknown / not detected";
    onStep?.(`Protocol: ${this.protocolName}`);
  }

  /** Start a streaming monitor (ATMA / ATMR / ATMT). Frames arrive via onStream. */
  async startMonitor(cmd: string, onFrame: (line: string) => void) {
    if (!this.transport || !this.transport.isOpen()) throw new Error("Adapter not connected");
    this.onStream = onFrame;
    this.streaming = true;
    this.buffer = "";
    this.push("tx", cmd);
    await this.transport.write(cmd + "\r");
  }

  /** Any character stops an ELM327 monitor session. */
  async stopMonitor() {
    if (this.transport && this.transport.isOpen()) {
      try {
        await this.transport.write("\r");
      } catch {
        /* ignore */
      }
    }
    await new Promise((r) => setTimeout(r, 250));
    this.streaming = false;
    this.onStream = null;
    this.buffer = "";
  }

  async close() {
    try {
      await this.transport?.close();
    } catch {
      /* ignore */
    }
    this.transport = null;
  }
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

const NEGATIVE = /NO DATA|UNABLE|ERROR|STOPPED|SEARCHING|TIMEOUT|CAN ERROR|BUS/i;

export function isNegative(resp: string) {
  return !resp || NEGATIVE.test(resp) || /(?:^|\s)7F\s+[0-9A-F]{2}\s+[0-9A-F]{2}(?:\s|$)/i.test(resp);
}

/** Flatten an ELM327 hex reply into a byte array, dropping CAN multi-line indices. */
export function parseHexBytes(resp: string): number[] {
  const out: number[] = [];
  for (const lineRaw of resp.split("\n")) {
    let line = lineRaw.trim();
    if (!line || NEGATIVE.test(line)) continue;
    // strip ISO-TP line index like "0:" / "1:"
    line = line.replace(/^[0-9A-F]:\s*/i, "");
    const tokens = line.match(/[0-9A-F]{2}/gi);
    if (!tokens) continue;
    for (const t of tokens) out.push(parseInt(t, 16));
  }
  return out;
}

/** Extract the payload after a mode+pid echo, e.g. 41 0C xx xx -> [xx,xx]. */
export function extractPayload(resp: string, mode: number, pid?: string): number[] | null {
  const bytes = parseHexBytes(resp);
  const respMode = 0x40 + mode;
  const pidVal = pid != null ? parseInt(pid, 16) : null;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === respMode) {
      if (pidVal == null) return bytes.slice(i + 1);
      if (bytes[i + 1] === pidVal) return bytes.slice(i + 2);
    }
  }
  return null;
}

/** Decode a Mode 03/07/0A DTC payload (2 bytes per code). */
export function decodeDtcBytes(bytes: number[]): string[] {
  const letters = ["P", "C", "B", "U"];
  const codes: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    if (a === 0 && b === 0) continue;
    const letter = letters[(a >> 6) & 0x03];
    const d1 = (a >> 4) & 0x03;
    const d2 = a & 0x0f;
    const d3 = (b >> 4) & 0x0f;
    const d4 = b & 0x0f;
    codes.push(`${letter}${d1}${d2.toString(16)}${d3.toString(16)}${d4.toString(16)}`.toUpperCase());
  }
  return Array.from(new Set(codes));
}

/** Mode 03 response -> codes. Handles CAN (43 NN ...) and legacy framing. */
export function parseDtcResponse(resp: string, mode: 3 | 7 | 0xa): string[] {
  if (isNegative(resp) && !/4[37A]/i.test(resp)) return [];
  const respMode = 0x40 + mode;
  const out: string[] = [];
  for (const lineRaw of resp.split("\n")) {
    const line = lineRaw.trim().replace(/^[0-9A-F]:\s*/i, "");
    const bytes = parseHexBytes(line);
    const idx = bytes.indexOf(respMode);
    if (idx === -1) continue;
    let rest = bytes.slice(idx + 1);
    // Some CAN adapters include a DTC-count byte. Drop it only when it exactly
    // matches the number of following two-byte entries; never discard a byte
    // merely because the reply length is odd.
    if (rest.length >= 3 && rest.length % 2 === 1 && rest[0] === (rest.length - 1) / 2) {
      rest = rest.slice(1);
    }
    if (rest.length % 2 !== 0) continue;
    out.push(...decodeDtcBytes(rest));
  }
  return Array.from(new Set(out));
}

/** Mode 09 PID 02 VIN decoding. */
export function parseVin(resp: string): string | null {
  const bytes: number[] = [];
  for (const lineRaw of resp.split("\n")) {
    let line = lineRaw.trim();
    if (!line || NEGATIVE.test(line)) continue;
    line = line.replace(/^[0-9A-F]:\s*/i, "");
    const toks = line.match(/[0-9A-F]{2}/gi)?.map((t) => parseInt(t, 16)) ?? [];
    let start = 0;
    const i49 = toks.indexOf(0x49);
    if (i49 !== -1 && toks[i49 + 1] === 0x02) start = i49 + 3; // skip 49 02 <frame#>
    for (let i = start; i < toks.length; i++) bytes.push(toks[i] as number);
  }
  const text = bytes
    .filter((b) => b >= 0x20 && b < 0x7f)
    .map((b) => String.fromCharCode(b))
    .join("");
  const matches = text.match(/[A-HJ-NPR-Z0-9]{17}/g) ?? [];
  return matches.length === 1 ? matches[0] ?? null : null;
}

/* ------------------------------------------------------------------ */
/* Multi-PID (batched) Mode 01 requests                                */
/* ------------------------------------------------------------------ */

/**
 * SAE J1979 allows up to six Mode 01 PIDs in a single CAN request
 * (e.g. "010C0D05114210"). The ECU answers with one 41 block containing every
 * requested PID back-to-back. Many older/non-CAN vehicles reject this, so the
 * caller must fall back to one request per PID when this returns nothing.
 *
 * `lengths` maps a PID hex string (upper case, 2 chars) to its data byte count.
 * Returns a map of PID hex -> data bytes, for whichever PIDs the ECU answered.
 */
export function parseBatchResponse(
  resp: string,
  lengths: Record<string, number>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (!resp || /NO DATA|UNABLE|ERROR|STOPPED|TIMEOUT|CAN ERROR|BUS/i.test(resp)) return out;

  const bytes: number[] = [];
  for (const lineRaw of resp.split("\n")) {
    let line = lineRaw.trim();
    if (!line || NEGATIVE.test(line)) continue;
    // ISO-TP total length header emitted before an indexed multi-frame reply
    if (/^[0-9A-F]{3}$/i.test(line)) continue;
    line = line.replace(/^[0-9A-F]:\s*/i, "");
    const toks = line.match(/[0-9A-F]{2}/gi);
    if (!toks) continue;
    for (const t of toks) bytes.push(parseInt(t, 16));
  }

  let i = bytes.indexOf(0x41);
  if (i === -1) return out;
  i += 1;
  while (i < bytes.length) {
    const pidByte = bytes[i];
    if (pidByte === undefined) break;
    if (pidByte === 0x41) {
      // a fresh response block (non-CAN protocols answer line by line)
      i += 1;
      continue;
    }
    const pid = pidByte.toString(16).toUpperCase().padStart(2, "0");
    const len = lengths[pid];
    if (len === undefined) break; // unknown framing — stop rather than guess
    const data = bytes.slice(i + 1, i + 1 + len);
    if (data.length < len) break;
    if (!out[pid]) out[pid] = data;
    i += 1 + len;
  }
  return out;
}


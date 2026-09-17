export type AgentState = "AGENT NOT INSTALLED" | "AGENT OFFLINE" | "AGENT CONNECTED" | "ADAPTER DISCOVERED" | "ADAPTER CONNECTED" | "VEHICLE COMMUNICATION ACTIVE";
export interface AgentCapabilities { serial: boolean; bluetoothClassic: boolean; ble: boolean; usb: boolean; socketCan: boolean; j2534: boolean; doip: boolean; vendorDrivers: string[] }
export interface AgentStatus { state: AgentState; version: string | null; paired: boolean; capabilities: AgentCapabilities | null; adapters: { id: string; name: string; transport: string }[] }
const DEFAULT_PORT = 45123;

export class LocalAgentClient {
  constructor(private port = DEFAULT_PORT, private token: string | null = null) {}
  setPairingToken(token: string) { this.token = token.trim() || null; }
  async probe(signal?: AbortSignal): Promise<AgentStatus> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/v1/status`, { signal: signal ?? null, headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} });
      if (response.status === 401) return { state: "AGENT CONNECTED", version: null, paired: false, capabilities: null, adapters: [] };
      if (!response.ok) throw new Error(`LOCAL AGENT UNAVAILABLE [${response.status}]`);
      return await response.json() as AgentStatus;
    } catch (error) {
      if (error instanceof TypeError) return { state: "AGENT OFFLINE", version: null, paired: false, capabilities: null, adapters: [] };
      throw error;
    }
  }
  async request(path: string, body: Record<string, unknown>) {
    if (!this.token) throw new Error("AUTHORIZATION REQUIRED");
    const response = await fetch(`http://127.0.0.1:${this.port}/v1/${path}`, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new Error(`LOCAL AGENT UNAVAILABLE [${response.status}]: ${text}`);
    return JSON.parse(text) as unknown;
  }
}
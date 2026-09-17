/**
 * Module 110 — ECU network topology built strictly from discovered modules.
 *
 * A node exists only when an address actually responded (or an imported,
 * sourced architecture dataset declares it). Parent/child edges are derived
 * from a gateway that itself responded; without one, every node is drawn flat
 * rather than under an invented gateway.
 */

export type NodeState = "ONLINE" | "OFFLINE" | "NOT RESPONDING" | "UNKNOWN" | "UNSUPPORTED" | "STALE";

export interface TopologyNode {
  address: string;
  system: string;
  name: string;
  protocol: string | null;
  requestId: string | null;
  responseId: string | null;
  doipAddress: string | null;
  latencyMs: number | null;
  servicesObserved: string[];
  dtcAvailable: boolean;
  liveDataAvailable: boolean;
  programmingCapable: "CONFIRMED" | "NOT CONFIRMED" | "UNSUPPORTED BY ADAPTER";
  sourceName: string;
  sourceUrl: string | null;
  state: NodeState;
  /** Raw evidence lines that justify this node existing at all. */
  evidence: string[];
}

export interface DiscoveredModule {
  header: string;
  system?: string;
  label?: string;
  protocol?: string | null;
  latencyMs?: number | null;
  storedDtcs?: string[];
  liveData?: boolean;
  services?: string[];
  lastSeen?: number | null;
  evidence?: string[];
}

const STALE_AFTER_MS = 10_000;

export function buildTopology(
  modules: DiscoveredModule[],
  options: { nativeBridge: boolean; now?: number } = { nativeBridge: false },
): TopologyNode[] {
  const now = options.now ?? Date.now();
  return modules.map((m) => {
    const responseId = m.header;
    const requestId = requestIdFor(m.header);
    const stale = m.lastSeen != null && now - m.lastSeen > STALE_AFTER_MS;
    return {
      address: m.header,
      system: m.system ?? "Unidentified system",
      name: m.label ?? m.header,
      protocol: m.protocol ?? null,
      requestId,
      responseId,
      doipAddress: null,
      latencyMs: m.latencyMs ?? null,
      servicesObserved: m.services ?? [],
      dtcAvailable: (m.storedDtcs?.length ?? 0) > 0 || Boolean(m.services?.includes("03")),
      liveDataAvailable: Boolean(m.liveData),
      programmingCapable: options.nativeBridge ? "NOT CONFIRMED" : "UNSUPPORTED BY ADAPTER",
      sourceName: "Live ECU discovery",
      sourceUrl: null,
      state: stale ? "STALE" : "ONLINE",
      evidence: m.evidence ?? [],
    };
  });
}

/** ISO 15765-4 response headers 7E8–7EF map back to requests 7E0–7E7. */
export function requestIdFor(responseHeader: string): string | null {
  const value = Number.parseInt(responseHeader, 16);
  if (!Number.isFinite(value)) return null;
  if (value >= 0x7e8 && value <= 0x7ef) return (value - 8).toString(16).toUpperCase();
  return null;
}

export interface TopologyEdge {
  from: string;
  to: string;
  /** Why this edge is drawn — never a guess about vehicle wiring. */
  basis: string;
}

export function topologyEdges(nodes: TopologyNode[]): TopologyEdge[] {
  const gateway = nodes.find((n) => /gateway/i.test(n.system));
  if (!gateway) return [];
  return nodes
    .filter((n) => n.address !== gateway.address)
    .map((n) => ({
      from: gateway.address,
      to: n.address,
      basis: "Both modules answered on the same diagnostic bus via the responding gateway",
    }));
}

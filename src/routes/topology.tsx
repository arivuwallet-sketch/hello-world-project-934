import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { buildTopology, topologyEdges, type NodeState, type TopologyNode } from "@/lib/obd/topology";

export const Route = createFileRoute("/topology")({
  head: () => ({
    meta: [
      { title: "ECU Network Topology | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Graph and table view of the vehicle diagnostic network, drawn only from modules that actually responded — addresses, protocol, latency, services and provenance.",
      },
      { property: "og:title", content: "ECU Network Topology | Vehicle Insight Hub" },
      { property: "og:description", content: "No invented nodes: every module on the map answered a request." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopologyPage,
});

const STATE_TONE: Record<NodeState, string> = {
  ONLINE: "text-signal border-signal/50",
  STALE: "text-warn border-warn/50",
  OFFLINE: "text-muted-foreground border-border",
  "NOT RESPONDING": "text-destructive border-destructive/50",
  UNKNOWN: "text-muted-foreground border-border",
  UNSUPPORTED: "text-muted-foreground border-border",
};

function TopologyPage() {
  const { state, ecus, protocolName, supportedPids, dtcs } = useObd();
  const [view, setView] = useState<"graph" | "table">("graph");
  const [selected, setSelected] = useState<string | null>(null);

  const nodes = useMemo(
    () =>
      buildTopology(
        ecus.map((ecu) => ({
          header: ecu.header,
          system: ecu.label,
          label: ecu.label,
          protocol: protocolName || null,
          storedDtcs: ecu.stored,
          liveData: ecu.header === "7E8" ? supportedPids.length > 0 : false,
          services: ["03", ...(ecu.pending.length > 0 ? ["07"] : []), ...(ecu.permanent.length > 0 ? ["0A"] : [])],
          lastSeen: Date.now(),
          evidence: [
            `Mode 03 response recorded from ${ecu.header}`,
            ...(ecu.stored.length > 0 ? [`Stored codes: ${ecu.stored.join(", ")}`] : []),
          ],
        })),
        { nativeBridge: false },
      ),
    [ecus, protocolName, supportedPids.length],
  );

  const edges = topologyEdges(nodes);
  const node = nodes.find((n) => n.address === selected) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ECU Network Topology</h1>
        <p className="text-sm text-muted-foreground">
          Drawn from the modules that answered a diagnostic request. Links are only drawn when a gateway module itself
          responded — no vehicle wiring is assumed.
        </p>
      </header>

      <div className="panel flex items-center gap-2 p-3">
        <Button size="sm" variant={view === "graph" ? "default" : "outline"} onClick={() => setView("graph")}>Graph view</Button>
        <Button size="sm" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>Table view</Button>
        <Badge variant="secondary" className="readout ml-auto text-[10px]">
          {nodes.length === 0 ? (state === "connected" ? "NO MODULES DISCOVERED YET" : "OBD ADAPTER NOT CONNECTED") : `${nodes.length} DISCOVERED`}
        </Badge>
      </div>

      {nodes.length === 0 ? (
        <p className="panel readout p-5 text-sm text-muted-foreground">
          Run a deep scan or full vehicle scan first. This page never draws a module it has not heard from.
        </p>
      ) : view === "graph" ? (
        <section className="panel p-6">
          <div className="flex flex-col items-center gap-6">
            {edges.length > 0 && (
              <>
                <NodeChip node={nodes.find((n) => /gateway/i.test(n.system))!} onSelect={setSelected} />
                <div className="h-6 w-px bg-border" />
              </>
            )}
            <div className="flex flex-wrap items-start justify-center gap-4">
              {nodes
                .filter((n) => edges.length === 0 || !/gateway/i.test(n.system))
                .map((n) => (
                  <NodeChip key={n.address} node={n} onSelect={setSelected} />
                ))}
            </div>
          </div>
          {edges.length === 0 && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              No gateway module responded, so modules are shown flat rather than under an assumed parent.
            </p>
          )}
        </section>
      ) : (
        <section className="panel overflow-x-auto p-5">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left">Address</th>
                <th className="py-1 text-left">System</th>
                <th className="py-1 text-left">Protocol</th>
                <th className="py-1 text-left">Request / response</th>
                <th className="py-1 text-left">Latency</th>
                <th className="py-1 text-left">Services</th>
                <th className="py-1 text-left">State</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.address} className="cursor-pointer border-t border-border/50 hover:bg-muted/40" onClick={() => setSelected(n.address)}>
                  <td className="readout py-1.5">{n.address}</td>
                  <td className="py-1.5">{n.system}</td>
                  <td className="py-1.5">{n.protocol ?? "DATA UNAVAILABLE"}</td>
                  <td className="readout py-1.5">{n.requestId ?? "—"} / {n.responseId}</td>
                  <td className="readout py-1.5">{n.latencyMs === null ? "DATA UNAVAILABLE" : `${n.latencyMs} ms`}</td>
                  <td className="readout py-1.5">{n.servicesObserved.join(" ") || "—"}</td>
                  <td className="readout py-1.5">{n.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {node && (
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Network className="size-4 text-signal" /> ECU details — {node.address}
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Detail label="System" value={node.system} />
            <Detail label="Name" value={node.name} />
            <Detail label="Protocol" value={node.protocol ?? "DATA UNAVAILABLE"} />
            <Detail label="CAN request ID" value={node.requestId ?? "DATA UNAVAILABLE"} />
            <Detail label="CAN response ID" value={node.responseId ?? "DATA UNAVAILABLE"} />
            <Detail label="DoIP logical address" value={node.doipAddress ?? "NOT APPLICABLE"} />
            <Detail label="Response latency" value={node.latencyMs === null ? "DATA UNAVAILABLE" : `${node.latencyMs} ms`} />
            <Detail label="Services observed" value={node.servicesObserved.join(", ") || "None recorded"} />
            <Detail label="DTC availability" value={node.dtcAvailable ? "AVAILABLE" : "UNKNOWN"} />
            <Detail label="Live data" value={node.liveDataAvailable ? "AVAILABLE" : "UNSUPPORTED BY ECU / UNKNOWN"} />
            <Detail label="Programming" value={node.programmingCapable} />
            <Detail label="Source" value={node.sourceName} />
            <Detail label="Status" value={node.state} />
            <Detail label="Codes on this module" value={dtcs.length > 0 ? dtcs.join(", ") : "None reported"} />
          </dl>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Raw communication evidence</summary>
            <pre className="readout mt-1 whitespace-pre-wrap">{node.evidence.join("\n")}</pre>
          </details>
        </section>
      )}
    </div>
  );
}

function NodeChip({ node, onSelect }: { node: TopologyNode; onSelect: (address: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.address)}
      className={`panel min-w-[150px] border p-3 text-left text-xs hover:bg-muted/40 ${STATE_TONE[node.state]}`}
    >
      <span className="readout block">{node.address}</span>
      <span className="mt-1 block font-semibold text-foreground">{node.system}</span>
      <span className="readout mt-1 block">{node.state}</span>
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="readout text-right">{value}</dd>
    </div>
  );
}

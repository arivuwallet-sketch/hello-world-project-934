import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalAgentClient, type AgentStatus } from "@/lib/obd/local-agent";

export const Route = createFileRoute("/local-agent")({
  head: () => ({ meta: [
    { title: "Local Hardware Agent | Vehicle Insight Hub" }, { name: "description", content: "Pair and inspect the secure localhost bridge for native serial, Bluetooth SPP, SocketCAN, J2534 and DoIP hardware." },
    { property: "og:title", content: "Local Hardware Agent | Vehicle Insight Hub" }, { property: "og:description", content: "Native hardware is reported only when a real local driver answers." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: LocalAgentPage,
});

function LocalAgentPage() {
  const client = useRef(new LocalAgentClient());
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const probe = async () => {
    client.current.setPairingToken(token);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 1500);
    try { setStatus(await client.current.probe(controller.signal)); setError(null); }
    catch (e) { setStatus(null); setError(e instanceof Error ? e.message : "LOCAL AGENT UNAVAILABLE"); }
    finally { clearTimeout(timeout); }
  };
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">Local Hardware Agent</h1><p className="text-sm text-muted-foreground">The browser UI, localhost agent, native driver, adapter and vehicle are separate states. None implies the next.</p></header>
    <section className="panel p-5"><h2 className="flex items-center gap-2 font-semibold"><Radio className="size-4 text-signal"/> Pair & probe</h2>
      <div className="mt-3 flex gap-2"><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pairing token from the local agent"/><Button onClick={() => void probe()}>Probe localhost</Button></div>
      <Badge variant="secondary" className="readout mt-3 text-[10px]">{status?.state ?? error ?? "AGENT NOT INSTALLED / NOT PROBED"}</Badge>
      <p className="mt-3 text-xs text-muted-foreground">The token remains in this page only. The agent accepts exact approved origins, binds to loopback, validates requests and rate-limits commands.</p>
    </section>
    <section className="panel p-5"><h2 className="font-semibold">Native capabilities</h2>{!status?.capabilities ? <p className="readout mt-3 text-sm text-muted-foreground">LOCAL AGENT UNAVAILABLE OR NOT PAIRED</p> : <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(status.capabilities).map(([key,value]) => <div key={key} className="flex justify-between border-b border-border/50 py-1"><dt>{key}</dt><dd className="readout">{Array.isArray(value) ? value.join(", ") || "NONE" : value ? "DETECTED" : "UNAVAILABLE"}</dd></div>)}</dl>}</section>
    <section className="panel p-5"><h2 className="font-semibold">Discovered adapters</h2>{status?.adapters.length ? <ul className="mt-3 space-y-2">{status.adapters.map((a) => <li key={a.id} className="rounded border border-border p-3 text-sm"><span className="font-medium">{a.name}</span><span className="readout ml-3 text-xs">{a.transport}</span></li>)}</ul> : <p className="readout mt-3 text-sm text-muted-foreground">NO NATIVE ADAPTER DISCOVERED</p>}</section>
  </div>;
}
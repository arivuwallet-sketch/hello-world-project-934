import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Usb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { adapterIdentityRows, capabilityClaims, latencyStats, type ClaimState } from "@/lib/obd/adapter-health";
import { summariseHealth, type ConnectionHealth, EMPTY_HEALTH } from "@/lib/obd/connection-health";

export const Route = createFileRoute("/adapter")({
  head: () => ({
    meta: [
      { title: "Adapter Health & Identity | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Real adapter identity, transport state, measured latency, counted errors and a capability table that separates advertised, detected and verified support.",
      },
      { property: "og:title", content: "Adapter Health & Identity | Vehicle Insight Hub" },
      { property: "og:description", content: "An advertised capability is not a verified capability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdapterHealthPage,
});

const CLAIM_TONE: Record<ClaimState, string> = {
  YES: "text-signal",
  NO: "text-destructive",
  UNKNOWN: "text-muted-foreground",
};

function AdapterHealthPage() {
  const { state, elm, adapterName, transport, protocolCode, protocolName, logEntries, sendRaw } = useObd();
  const [voltage, setVoltage] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (state === "connected") setConnectedAt((cur) => cur ?? Date.now());
    else setConnectedAt(null);
  }, [state]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const health: ConnectionHealth = useMemo(() => {
    const tx = logEntries.filter((e) => e.dir === "tx");
    const rx = logEntries.filter((e) => e.dir === "rx");
    const latencies: number[] = [];
    for (const request of tx) {
      const answer = rx.find((r) => r.ts >= request.ts);
      if (answer) latencies.push(answer.ts - request.ts);
    }
    return {
      ...EMPTY_HEALTH,
      requests: tx.length,
      responses: rx.filter((r) => !/NO DATA|ERROR|TIMEOUT|STOPPED/i.test(r.text)).length,
      timeouts: rx.filter((r) => /TIMEOUT/i.test(r.text)).length,
      frameErrors: rx.filter((r) => /ERROR|BUFFER FULL|CAN ERROR/i.test(r.text)).length,
      latencySamples: latencies.slice(-200),
    };
  }, [logEntries]);

  const summary = summariseHealth(health);
  const latency = latencyStats(health.latencySamples);
  const lastRx = [...logEntries].reverse().find((e) => e.dir === "rx") ?? null;
  const lastError = [...logEntries].reverse().find((e) => e.dir === "rx" && /ERROR|NO DATA|TIMEOUT|UNABLE/i.test(e.text)) ?? null;

  const claims = capabilityClaims({
    identity: elm.adapterVersion || null,
    transport,
    protocolCode: protocolCode || null,
    rawFramesObserved: logEntries.some((e) => e.dir === "rx" && /^[0-9A-F]{3}\s/i.test(e.text.trim())),
    isotpObserved: logEntries.some((e) => e.dir === "rx" && /^\s*0:/m.test(e.text)),
    udsObserved: logEntries.some((e) => e.dir === "rx" && /\b(50|59|62|6E|71|74|76|77)\b/.test(e.text)),
    nativeBridge: false,
    voltageObserved: voltage !== null,
  });

  const identity = adapterIdentityRows({
    name: adapterName,
    version: elm.adapterVersion,
    transport,
    firmware: elm.adapterVersion || null,
    serialNumber: null,
    bluetoothAddress: null,
    usbIdentity: null,
    nativeBridge: false,
  });

  const readVoltage = async () => {
    const response = await sendRaw("AT RV");
    const match = response.match(/(\d+\.\d+)\s*V?/i);
    setVoltage(match ? `${match[1]} V` : "DATA UNAVAILABLE — adapter did not return a voltage");
  };

  const duration = connectedAt ? Math.floor((now - connectedAt) / 1000) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Adapter Health & Identity</h1>
        <p className="text-sm text-muted-foreground">
          Every value here was returned by the adapter or counted from real traffic. Nothing is inferred from the
          device name.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Usb className="size-4 text-signal" /> Identity</h2>
          <dl className="mt-3 space-y-1 text-sm">
            {identity.map((row) => (
              <div key={row.field} className="flex justify-between gap-4 border-b border-border/40 py-1">
                <dt className="text-muted-foreground">{row.field}</dt>
                <dd className="readout text-right">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Connection</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Transport" value={transport ?? "OBD ADAPTER NOT CONNECTED"} />
            <Row label="State" value={state.toUpperCase()} />
            <Row label="Protocol" value={protocolCode ? `${protocolCode} — ${protocolName}` : "PROTOCOL NOT DETECTED"} />
            <Row label="Connection start" value={connectedAt ? new Date(connectedAt).toLocaleTimeString() : "DATA UNAVAILABLE"} />
            <Row label="Connection duration" value={duration === null ? "DATA UNAVAILABLE" : `${duration} s`} />
            <Row label="Last successful response" value={lastRx ? new Date(lastRx.ts).toLocaleTimeString() : "DATA UNAVAILABLE"} />
            <Row label="Last error" value={lastError ? lastError.text.trim().slice(0, 40) : "None recorded"} />
            <Row label="TX count" value={String(health.requests)} />
            <Row label="RX count" value={String(health.responses)} />
            <Row label="Timeout count" value={String(summary.timeouts)} />
            <Row label="Communication errors" value={String(summary.frameErrors)} />
            <Row label="Response rate" value={summary.responseRate} />
          </dl>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Performance</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Current latency" value={latency.current} />
            <Row label="Average latency" value={latency.average} />
            <Row label="Minimum latency" value={latency.min} />
            <Row label="Maximum latency" value={latency.max} />
            <Row label="Latency samples" value={String(latency.samples)} />
          </dl>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Power</h2>
          <p className="readout mt-3 text-sm">{voltage ?? "Not measured yet"}</p>
          <Button size="sm" variant="outline" className="mt-3" disabled={state !== "connected"} onClick={() => void readVoltage()}>
            Read adapter voltage (AT RV)
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            External voltage measurement requires a separate measurement interface: DATA UNAVAILABLE.
          </p>
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="font-semibold">Capabilities</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Advertised comes from the adapter's own identity string. Verified needs real traffic to have proven it.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left">Capability</th>
                <th className="py-1 text-left">Advertised</th>
                <th className="py-1 text-left">Detected</th>
                <th className="py-1 text-left">Verified</th>
                <th className="py-1 text-left">Basis</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.capability} className="border-t border-border/50">
                  <td className="py-1.5 font-medium">{claim.capability}</td>
                  <td className={`readout py-1.5 ${CLAIM_TONE[claim.advertised]}`}>{claim.advertised}</td>
                  <td className={`readout py-1.5 ${CLAIM_TONE[claim.detected]}`}>{claim.detected}</td>
                  <td className={`readout py-1.5 ${CLAIM_TONE[claim.verified]}`}>{claim.verified}</td>
                  <td className="py-1.5 text-muted-foreground">{claim.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Badge variant="secondary" className="readout mt-3 text-[10px]">
          NO CAPABILITY IS MARKED VERIFIED WITHOUT OBSERVED TRAFFIC
        </Badge>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="readout text-right">{value}</dd>
    </div>
  );
}

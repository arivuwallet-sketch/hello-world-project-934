import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Radar, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useObd } from "@/lib/obd/store";
import { isNegative, parseDtcResponse, parseVin } from "@/lib/obd/elm327";
import {
  EMPTY_PROGRESS,
  SCAN_TARGETS,
  newSystemResult,
  progressPercent,
  scanDurationMs,
  summariseScan,
  type ScanProgress,
  type SystemResult,
} from "@/lib/obd/full-scan";

export const Route = createFileRoute("/full-scan")({
  head: () => ({
    meta: [
      { title: "Full Vehicle Scan | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Probe every standard diagnostic address and list only the modules that actually answered, with their codes, protocol, latency and raw evidence.",
      },
      { property: "og:title", content: "Full Vehicle Scan | Vehicle Insight Hub" },
      { property: "og:description", content: "Progress reflects completed diagnostic requests, never a timer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FullScanPage,
});

const STATUS_TONE: Record<SystemResult["status"], "default" | "secondary" | "destructive" | "outline"> = {
  RESPONDING: "default",
  "NOT RESPONDING": "secondary",
  "NOT DETECTED": "secondary",
  "UNSUPPORTED BY VEHICLE": "outline",
  TIMEOUT: "destructive",
  ERROR: "destructive",
};

function FullScanPage() {
  const { state, sendRaw, protocolName } = useObd();
  const [results, setResults] = useState<SystemResult[]>([]);
  const [progress, setProgress] = useState<ScanProgress>(EMPTY_PROGRESS);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const cancelRef = useRef(false);

  const runScan = async () => {
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setLog([]);
    const planned = SCAN_TARGETS.length * 4;
    let live: ScanProgress = { ...EMPTY_PROGRESS, planned, startedAt: Date.now() };
    setProgress(live);
    const collected: SystemResult[] = [];

    const step = (patch: Partial<ScanProgress>) => {
      live = { ...live, ...patch };
      setProgress(live);
    };
    const note = (line: string) => setLog((cur) => [...cur.slice(-200), `${new Date().toLocaleTimeString()}  ${line}`]);

    const ask = async (cmd: string) => {
      step({ requests: live.requests + 1 });
      const started = Date.now();
      try {
        const response = await sendRaw(cmd);
        step({ responses: live.responses + 1, completed: live.completed + 1 });
        note(`TX ${cmd}  →  ${response.replace(/\s+/g, " ").trim().slice(0, 60)}`);
        return { response, latency: Date.now() - started };
      } catch (error) {
        step({ failures: live.failures + 1, completed: live.completed + 1 });
        note(`TX ${cmd}  →  FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
        return { response: null, latency: Date.now() - started };
      }
    };

    for (const target of SCAN_TARGETS) {
      if (cancelRef.current) break;
      const row = newSystemResult(target);
      await sendRaw(`AT SH ${target.header}`).catch(() => null);

      const supported = await ask("0100");
      if (supported.response === null || /NO DATA|UNABLE|CAN ERROR|TIMEOUT|ERROR/i.test(supported.response) || isNegative(supported.response)) {
        row.status = supported.response && /TIMEOUT/i.test(supported.response) ? "TIMEOUT" : "NOT RESPONDING";
        row.evidence.push(`0100 → ${supported.response ?? "no response"}`);
        collected.push(row);
        setResults([...collected]);
        step({ completed: live.completed + 3 });
        continue;
      }

      row.status = "RESPONDING";
      row.protocol = protocolName || null;
      row.latencyMs = supported.latency;
      row.liveData = "AVAILABLE";
      row.responseHeader = supported.response.trim().split(/\s+/)[0] ?? null;
      row.evidence.push(`0100 → ${supported.response.replace(/\s+/g, " ").trim()}`);

      const stored = await ask("03");
      if (stored.response && !isNegative(stored.response)) {
        row.storedDtcs = parseDtcResponse(stored.response, 3);
        row.evidence.push(`03 → ${stored.response.replace(/\s+/g, " ").trim()}`);
      }
      const pending = await ask("07");
      if (pending.response && !isNegative(pending.response)) {
        row.pendingDtcs = parseDtcResponse(pending.response, 7);
        row.evidence.push(`07 → ${pending.response.replace(/\s+/g, " ").trim()}`);
      }
      const vin = await ask("0902");
      if (vin.response && parseVin(vin.response)) {
        row.vin = "AVAILABLE";
        row.evidence.push(`0902 → ${parseVin(vin.response)}`);
      } else {
        row.vin = "UNSUPPORTED BY ECU";
      }

      collected.push(row);
      setResults([...collected]);
    }

    await sendRaw("AT SH 7DF").catch(() => null);
    step({ finishedAt: Date.now(), cancelled: cancelRef.current });
    setRunning(false);
  };

  const percent = progressPercent(progress);
  const duration = scanDurationMs(progress);
  const summary = summariseScan(results);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Full Vehicle Scan</h1>
        <p className="text-sm text-muted-foreground">
          Every standard diagnostic address is probed. A module appears only if it answered — nothing is listed because
          it is common on this kind of vehicle.
        </p>
      </header>

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <Button size="sm" disabled={state !== "connected" || running} onClick={() => void runScan()}>
          <Radar className="mr-2 size-4" /> Start scan
        </Button>
        <Button size="sm" variant="outline" disabled={!running} onClick={() => (cancelRef.current = true)}>
          <Square className="mr-2 size-4" /> Cancel
        </Button>
        {state !== "connected" && (
          <Badge variant="secondary" className="readout text-[10px]">OBD ADAPTER NOT CONNECTED</Badge>
        )}
        <span className="readout ml-auto text-xs text-muted-foreground">
          {percent === null ? "No work planned yet" : `${progress.completed} / ${progress.planned} requests completed`}
        </span>
      </div>

      {percent !== null && <Progress value={percent} className="h-2" />}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Modules responding" value={String(summary.responding)} />
        <Stat label="Modules with faults" value={String(summary.withFaults)} />
        <Stat label="Stored / pending codes" value={`${summary.totalStored} / ${summary.totalPending}`} />
        <Stat label="Scan duration" value={duration === null ? "DATA UNAVAILABLE" : `${(duration / 1000).toFixed(1)} s`} />
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Systems</h2>
        {results.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">
            {state === "connected" ? "No scan has run yet." : "OBD ADAPTER NOT CONNECTED"}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {results.map((row) => (
              <li key={row.header} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold uppercase">{row.system}</span>
                  <span className="readout text-xs text-muted-foreground">req {row.header}</span>
                  <Badge variant={STATUS_TONE[row.status]} className="readout ml-auto text-[10px]">{row.status}</Badge>
                </div>
                {row.status === "RESPONDING" && (
                  <dl className="readout mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                    <div>ECU: {row.responseHeader ?? "DATA UNAVAILABLE"}</div>
                    <div>PROTOCOL: {row.protocol ?? "DATA UNAVAILABLE"}</div>
                    <div>LATENCY: {row.latencyMs === null ? "DATA UNAVAILABLE" : `${row.latencyMs} ms`}</div>
                    <div>DTCs: {row.storedDtcs.length} stored · {row.pendingDtcs.length} pending</div>
                    <div>LIVE DATA: {row.liveData}</div>
                    <div>VIN: {row.vin}</div>
                  </dl>
                )}
                {row.storedDtcs.length + row.pendingDtcs.length > 0 && (
                  <p className="readout mt-2 text-xs text-warn">{[...row.storedDtcs, ...row.pendingDtcs].join("  ")}</p>
                )}
                {row.evidence.length > 0 && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Raw evidence</summary>
                    <pre className="readout mt-1 whitespace-pre-wrap">{row.evidence.join("\n")}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Scan log</h2>
        <pre className="readout mt-3 h-56 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-3 text-xs">
          {log.length === 0 ? "No requests sent yet." : log.join("\n")}
        </pre>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="readout mt-1 text-lg">{value}</p>
    </div>
  );
}

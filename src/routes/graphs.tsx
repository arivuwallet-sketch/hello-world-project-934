import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";

export const Route = createFileRoute("/graphs")({
  head: () => ({
    meta: [
      { title: "Waveform Graph Engine | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Overlay real live signals with cursor measurement, min/max/average/median statistics, per-signal source and stale markers — no fabricated graph points.",
      },
      { property: "og:title", content: "Waveform Graph Engine | Vehicle Insight Hub" },
      { property: "og:description", content: "Plots only measured samples; on disconnect the last point is marked stale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GraphsPage,
});

const COLORS = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#f472b6", "#60a5fa"];

function GraphsPage() {
  const { state, history, signalDetails, activePids, polling, setPolling, protocolName } = useObd();
  const [enabled, setEnabled] = useState<PidId[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);

  const available = activePids.filter((id) => (history[id]?.length ?? 0) > 0);
  const shown = enabled.length > 0 ? enabled.filter((id) => available.includes(id)) : available.slice(0, 3);

  const bounds = useMemo(() => {
    const times = shown.flatMap((id) => (history[id] ?? []).map((s) => s.t));
    if (times.length === 0) return null;
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [shown, history]);

  const toggle = (id: PidId) =>
    setEnabled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Waveform Graph Engine</h1>
        <p className="text-sm text-muted-foreground">
          Every point is a measurement returned by the ECU. When the adapter disconnects, plotting stops and the final
          point is marked stale rather than extended.
        </p>
      </header>

      <div className="panel flex flex-wrap items-center gap-2 p-4">
        <Button size="sm" variant="outline" disabled={state !== "connected"} onClick={() => setPolling(!polling)}>
          {polling ? "Pause sampling" : "Resume sampling"}
        </Button>
        {available.map((id) => (
          <Button key={id} size="sm" variant={shown.includes(id) ? "default" : "outline"} onClick={() => toggle(id)}>
            {PID_BY_ID[id]?.label ?? id}
          </Button>
        ))}
        <Badge variant={state === "connected" ? "default" : "secondary"} className="readout ml-auto text-[10px]">
          {state === "connected" ? (polling ? "SAMPLING" : "PAUSED") : "CONNECTION LOST — LAST RECEIVED, STALE"}
        </Badge>
      </div>

      {shown.length === 0 || !bounds ? (
        <p className="panel readout p-5 text-sm text-muted-foreground">
          WAITING FOR VALID VEHICLE DATA — no measured samples have arrived yet.
        </p>
      ) : (
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-signal" /> Overlay</h2>
          <svg
            viewBox="0 0 1000 320"
            className="mt-3 h-72 w-full rounded bg-background/60"
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              setCursor(bounds.min + ratio * (bounds.max - bounds.min));
            }}
            onMouseLeave={() => setCursor(null)}
          >
            {shown.map((id, index) => {
              const samples = history[id] ?? [];
              const def = PID_BY_ID[id];
              const values = samples.map((s) => s.v);
              const lo = Math.min(...values);
              const hi = Math.max(...values);
              const span = hi - lo || 1;
              const points = samples
                .map((s) => {
                  const x = ((s.t - bounds.min) / Math.max(1, bounds.max - bounds.min)) * 1000;
                  const y = 300 - ((s.v - lo) / span) * 280;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");
              return (
                <g key={id}>
                  <polyline points={points} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="1.6" />
                  <text x="6" y={16 + index * 14} fill={COLORS[index % COLORS.length]} fontSize="11">
                    {def?.label ?? id} ({def?.unit ?? ""}) {lo.toFixed(1)}–{hi.toFixed(1)}
                  </text>
                </g>
              );
            })}
            {cursor !== null && (
              <line
                x1={((cursor - bounds.min) / Math.max(1, bounds.max - bounds.min)) * 1000}
                x2={((cursor - bounds.min) / Math.max(1, bounds.max - bounds.min)) * 1000}
                y1="0"
                y2="320"
                stroke="currentColor"
                strokeDasharray="3 3"
                opacity="0.5"
              />
            )}
          </svg>
          <p className="readout mt-2 text-xs text-muted-foreground">
            Time axis {new Date(bounds.min).toLocaleTimeString()} → {new Date(bounds.max).toLocaleTimeString()}
            {cursor !== null && ` · cursor ${new Date(cursor).toLocaleTimeString()}`}
          </p>
        </section>
      )}

      <section className="panel overflow-x-auto p-5">
        <h2 className="font-semibold">Signal statistics & provenance</h2>
        <table className="mt-3 w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left">Signal</th>
              <th className="py-1 text-right">Samples</th>
              <th className="py-1 text-right">Min</th>
              <th className="py-1 text-right">Max</th>
              <th className="py-1 text-right">Average</th>
              <th className="py-1 text-right">Median</th>
              <th className="py-1 text-right">Delta</th>
              <th className="py-1 text-left pl-3">Source</th>
              <th className="py-1 text-left">Quality</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((id) => {
              const samples = history[id] ?? [];
              const values = samples.map((s) => s.v).sort((a, b) => a - b);
              const detail = signalDetails[id];
              const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
              const median = values[Math.floor(values.length / 2)];
              const first = samples[0]?.v;
              const last = samples[samples.length - 1]?.v;
              return (
                <tr key={id} className="border-t border-border/50">
                  <td className="py-1.5">{PID_BY_ID[id]?.label ?? id}</td>
                  <td className="readout py-1.5 text-right">{samples.length}</td>
                  <td className="readout py-1.5 text-right">{values.length ? values[0]!.toFixed(1) : "—"}</td>
                  <td className="readout py-1.5 text-right">{values.length ? values[values.length - 1]!.toFixed(1) : "—"}</td>
                  <td className="readout py-1.5 text-right">{values.length ? avg.toFixed(1) : "—"}</td>
                  <td className="readout py-1.5 text-right">{median === undefined ? "—" : median.toFixed(1)}</td>
                  <td className="readout py-1.5 text-right">
                    {first === undefined || last === undefined ? "—" : (last - first).toFixed(1)}
                  </td>
                  <td className="py-1.5 pl-3 text-muted-foreground">
                    {detail ? `mode ${detail.mode} PID ${detail.pid} · ${detail.sourceName}` : "DATA UNAVAILABLE"}
                  </td>
                  <td className="readout py-1.5">
                    {state === "connected" ? (detail?.quality ?? "UNKNOWN") : "LAST RECEIVED — STALE"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Protocol in use: {protocolName || "PROTOCOL NOT DETECTED"}. Raw responses for each point are kept with the
          signal detail and shown on the Raw Console.
        </p>
      </section>
    </div>
  );
}

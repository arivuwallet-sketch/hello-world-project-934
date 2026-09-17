import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  cursorReading,
  measureChannel,
  parseScopeCsv,
  type ScopeChannel,
} from "@/lib/obd/scope";

export const Route = createFileRoute("/scope")({
  head: () => ({
    meta: [
      { title: "Oscilloscope & Waveforms | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Four-channel waveform analysis with peak, RMS, period, frequency, duty cycle and cursor deltas computed only from real acquired samples.",
      },
      { property: "og:title", content: "Oscilloscope & Waveforms | Vehicle Insight Hub" },
      { property: "og:description", content: "No scope connected means no waveform is drawn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScopePage,
});

const CHANNEL_INDEXES = [1, 2, 3, 4] as const;

function emptyChannel(index: 1 | 2 | 3 | 4): ScopeChannel {
  return {
    index,
    label: `Channel ${index}`,
    unit: "V",
    coupling: "UNKNOWN",
    scale: 1,
    sampleRateHz: null,
    samples: [],
    device: null,
    capturedAt: null,
  };
}

function Waveform({ channel }: { channel: ScopeChannel }) {
  if (channel.samples.length < 2) {
    return (
      <div className="readout flex h-40 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        OSCILLOSCOPE DATA UNAVAILABLE
      </div>
    );
  }
  const times = channel.samples.map((sample) => sample.t);
  const values = channel.samples.map((sample) => sample.v);
  const tMin = Math.min(...times);
  const tSpan = Math.max(...times) - tMin || 1;
  const vMin = Math.min(...values);
  const vSpan = Math.max(...values) - vMin || 1;
  const points = channel.samples
    .map((sample) => `${((sample.t - tMin) / tSpan) * 100},${100 - ((sample.v - vMin) / vSpan) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full rounded-md border border-border">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="0.6" className="text-signal" />
    </svg>
  );
}

function ScopePage() {
  const [channels, setChannels] = useState<ScopeChannel[]>(CHANNEL_INDEXES.map(emptyChannel));
  const [selected, setSelected] = useState<1 | 2 | 3 | 4>(1);
  const [cursorA, setCursorA] = useState("0");
  const [cursorB, setCursorB] = useState("0");
  const [skipped, setSkipped] = useState<number | null>(null);

  const channel = channels.find((item) => item.index === selected) ?? null;
  const measurements = useMemo(() => measureChannel(channel), [channel]);
  const cursor = useMemo(
    () => cursorReading(channel, Number(cursorA) || 0, Number(cursorB) || 0),
    [channel, cursorA, cursorB],
  );

  async function load(index: 1 | 2 | 3 | 4, file: File) {
    const result = parseScopeCsv(await file.text());
    setSkipped(result.skipped);
    setChannels((current) =>
      current.map((item) =>
        item.index === index
          ? {
              ...item,
              samples: result.samples,
              device: `Imported capture: ${file.name}`,
              capturedAt: new Date(file.lastModified).toISOString(),
              sampleRateHz:
                result.samples.length > 1
                  ? Math.round(1 / ((result.samples.at(-1)!.t - result.samples[0]!.t) / (result.samples.length - 1)))
                  : null,
            }
          : item,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Oscilloscope &amp; waveforms</h1>
        <p className="text-sm text-muted-foreground">
          Waveforms come from a real capture — a connected scope through the local agent, or a capture file exported by
          your instrument. Nothing is drawn without samples.
        </p>
      </header>

      <section className="panel space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Activity className="size-4 text-signal" /> Channels
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {channels.map((item) => (
            <div key={item.index} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  className={item.index === selected ? "font-semibold text-signal" : "font-medium"}
                  onClick={() => setSelected(item.index)}
                >
                  {item.label}
                </button>
                <Badge variant="outline" className="readout text-[10px]">
                  {item.samples.length > 0 ? `${item.samples.length} SAMPLES` : "NO ACQUISITION"}
                </Badge>
                <span className="readout text-xs text-muted-foreground">
                  {item.unit} · coupling {item.coupling} · {item.sampleRateHz ? `${item.sampleRateHz} Hz` : "rate unknown"}
                </span>
              </div>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="mt-2 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void load(item.index, file);
                }}
              />
              <p className="readout mt-1 text-xs text-muted-foreground">
                {item.device ?? "NO INSTRUMENT CONNECTED"} ·{" "}
                {item.capturedAt ? new Date(item.capturedAt).toLocaleString() : "no capture time"}
              </p>
            </div>
          ))}
        </div>
        {skipped != null && skipped > 0 && (
          <p className="readout text-xs text-muted-foreground">
            {skipped} rows skipped — they contained no valid time/value pair and were not interpolated.
          </p>
        )}
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-semibold">{channel?.label ?? "Channel"} measurements</h2>
        <Waveform channel={channel ?? emptyChannel(1)} />
        {!measurements.available ? (
          <p className="readout text-sm text-muted-foreground">{measurements.reason}</p>
        ) : (
          <div className="readout grid gap-1 text-xs sm:grid-cols-3">
            <div>Samples: {measurements.sampleCount}</div>
            <div>Minimum: {measurements.min?.toFixed(4)}</div>
            <div>Peak: {measurements.peak?.toFixed(4)}</div>
            <div>Peak-to-peak: {measurements.peakToPeak?.toFixed(4)}</div>
            <div>Mean: {measurements.mean?.toFixed(4)}</div>
            <div>RMS: {measurements.rms?.toFixed(4)}</div>
            <div>Period: {measurements.periodSeconds != null ? `${(measurements.periodSeconds * 1000).toFixed(3)} ms` : "NOT MEASURABLE"}</div>
            <div>Frequency: {measurements.frequencyHz != null ? `${measurements.frequencyHz.toFixed(2)} Hz` : "NOT MEASURABLE"}</div>
            <div>Duty cycle: {measurements.dutyCyclePercent != null ? `${measurements.dutyCyclePercent.toFixed(1)} %` : "NOT MEASURABLE"}</div>
            <div>
              Pulse width:{" "}
              {measurements.pulseWidthSeconds != null
                ? `${(measurements.pulseWidthSeconds * 1000).toFixed(3)} ms`
                : "NOT MEASURABLE"}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-32" placeholder="Cursor A (s)" value={cursorA} onChange={(e) => setCursorA(e.target.value)} />
          <Input className="w-32" placeholder="Cursor B (s)" value={cursorB} onChange={(e) => setCursorB(e.target.value)} />
          <span className="readout text-xs text-muted-foreground">
            {cursor
              ? `Δt ${(cursor.deltaSeconds * 1000).toFixed(3)} ms · ΔV ${cursor.deltaValue?.toFixed(4)}`
              : "CURSOR MEASUREMENT UNAVAILABLE"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Period, frequency, duty cycle and pulse width are derived from real threshold crossings in the captured data.
          Where the capture does not contain enough crossings the result stays NOT MEASURABLE.
        </p>
      </section>
    </div>
  );
}

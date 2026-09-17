import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gauge, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  INSTRUMENT_KINDS,
  MEASUREMENT_CATEGORIES,
  deleteMeasurement,
  groupByCategory,
  instrumentInterfaces,
  loadMeasurements,
  recordMeasurement,
  type InstrumentKind,
  type Measurement,
  type MeasurementCategory,
} from "@/lib/obd/measurements";
import { loadDiagSessions, type DiagSession } from "@/lib/obd/diag-sessions";
import { loadOperator } from "@/lib/obd/roles";

export const Route = createFileRoute("/measurements")({
  head: () => ({
    meta: [
      { title: "External Measurements | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Records multimeter, scope, pressure, clamp, battery and other instrument readings with device, channel, timestamp and quality kept separate from ECU values.",
      },
      { property: "og:title", content: "External Measurements | Vehicle Insight Hub" },
      { property: "og:description", content: "Instrument, ECU, entered and calculated values are never mixed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MeasurementsPage,
});

function MeasurementsPage() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [sessions, setSessions] = useState<DiagSession[]>([]);
  const [form, setForm] = useState({
    name: "",
    value: "",
    unit: "",
    category: "EXTERNAL INSTRUMENT" as MeasurementCategory,
    instrument: "MULTIMETER" as InstrumentKind,
    device: "",
    channel: "",
    sampleRateHz: "",
    sessionId: "",
  });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setMeasurements(loadMeasurements());
    setSessions(loadDiagSessions());
  }, []);

  const interfaces = instrumentInterfaces(null);

  function submit() {
    const operator = loadOperator();
    const result = recordMeasurement({
      name: form.name,
      value: Number(form.value),
      unit: form.unit,
      category: form.category,
      source: form.category === "EXTERNAL INSTRUMENT" ? `Instrument: ${form.instrument}` : form.category,
      device: form.device.trim() || null,
      instrument: form.category === "EXTERNAL INSTRUMENT" ? form.instrument : null,
      sampleRateHz: Number(form.sampleRateHz) > 0 ? Number(form.sampleRateHz) : null,
      channel: form.channel.trim() || null,
      quality: "UNVERIFIED",
      sessionId: form.sessionId || null,
      technician: operator.name || operator.role,
    });
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setMeasurements(loadMeasurements());
    setForm({ ...form, name: "", value: "", channel: "" });
    setNotice("Measurement recorded with its source and timestamp.");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">External measurements</h1>
        <p className="text-sm text-muted-foreground">
          Instrument readings live beside vehicle data without ever being merged into it. Each entry keeps its device,
          channel, timestamp and category.
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Gauge className="size-4 text-signal" /> Instrument interfaces
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {interfaces.map((item) => (
            <li key={item.kind} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span>{item.kind}</span>
              <Badge variant="outline" className="readout text-[10px]">{item.state}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Browsers cannot reach these instruments directly. Each one becomes available only when the local agent reports
          a real installed driver for it.
        </p>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-semibold">Record a measurement</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Measurement name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Measured value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <Input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as MeasurementCategory })}
          >
            {MEASUREMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.instrument}
            onChange={(e) => setForm({ ...form, instrument: e.target.value as InstrumentKind })}
            disabled={form.category !== "EXTERNAL INSTRUMENT"}
          >
            {INSTRUMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
          <Input placeholder="Device identity" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} />
          <Input placeholder="Channel (optional)" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
          <Input
            placeholder="Sample rate Hz (optional)"
            value={form.sampleRateHz}
            onChange={(e) => setForm({ ...form, sampleRateHz: e.target.value })}
          />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.sessionId}
            onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
          >
            <option value="">No session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.workOrderId || session.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={submit}>Record measurement</Button>
        {notice && <p className="readout text-xs text-muted-foreground">{notice}</p>}
      </section>

      {groupByCategory(measurements).map((group) => (
        <section key={group.category} className="panel p-5">
          <h2 className="font-semibold">{group.category}</h2>
          {group.items.length === 0 ? (
            <p className="readout mt-2 text-sm text-muted-foreground">NO MEASUREMENTS IN THIS CATEGORY</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {group.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline gap-2 border-b border-border/60 py-1.5">
                  <span className="font-medium">{item.name}</span>
                  <span className="readout">
                    {item.value} {item.unit}
                  </span>
                  <span className="readout text-xs text-muted-foreground">
                    {item.device ?? "device unknown"} · {item.channel ?? "no channel"} ·{" "}
                    {item.sampleRateHz ? `${item.sampleRateHz} Hz` : "rate n/a"} · {item.quality} ·{" "}
                    {new Date(item.timestamp).toLocaleString()} · {item.technician}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-danger"
                    onClick={() => {
                      deleteMeasurement(item.id);
                      setMeasurements(loadMeasurements());
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

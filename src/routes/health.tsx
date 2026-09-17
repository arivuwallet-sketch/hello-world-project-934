import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, HeartPulse, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";
import {
  assessHealth,
  detectAnomaly,
  loadEvents,
  maintenanceStatus,
  type MaintenanceItem,
  type VehicleEvent,
} from "@/lib/obd/analysis";
import { loadRecords, newId, saveRecords } from "@/lib/obd/persist";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Vehicle Health & Events | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Evidence-based vehicle health states, real event log, user-entered maintenance intervals and z-score anomaly detection over recorded samples.",
      },
      { property: "og:title", content: "Vehicle Health & Events | Vehicle Insight Hub" },
      { property: "og:description", content: "No health percentages — only NORMAL, ATTENTION, FAULT PRESENT or INSUFFICIENT DATA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

const MAINT_KEY = "obd.maintenanceItems";

function HealthPage() {
  const { state, dtcs, pendingDtcs, milOn, readiness, live, history, activeVehicleId } = useObd();
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [draft, setDraft] = useState({ name: "", intervalKm: "", lastServiceKm: "", currentOdometerKm: "" });

  useEffect(() => {
    setEvents(loadEvents());
    setItems(loadRecords<MaintenanceItem>(MAINT_KEY));
  }, []);

  const assessments = useMemo(
    () =>
      assessHealth({
        connected: state === "connected",
        storedDtcs: dtcs,
        pendingDtcs,
        milOn,
        readinessSupported: Boolean(readiness),
        readinessIncomplete: readiness
          ? [...readiness.continuous, ...readiness.nonContinuous]
              .filter((monitor) => monitor.supported && !monitor.complete)
              .map((monitor) => monitor.name)
          : [],
        coolantC: live.coolant ?? null,
        voltage: live.voltage ?? null,
      }),
    [state, dtcs, pendingDtcs, milOn, readiness, live.coolant, live.voltage],
  );

  const anomalies = useMemo(() => {
    const results = [];
    for (const [key, samples] of Object.entries(history)) {
      if (!samples || samples.length === 0) continue;
      const values = samples.map((sample) => sample.v);
      const latest = values[values.length - 1];
      if (latest == null) continue;
      const result = detectAnomaly(key, values.slice(0, -1), latest);
      if (result) results.push(result);
    }
    return results;
  }, [history]);

  const addItem = () => {
    if (!draft.name.trim()) return;
    const item: MaintenanceItem = {
      id: newId(),
      name: draft.name.trim(),
      intervalKm: draft.intervalKm ? Number(draft.intervalKm) : null,
      intervalSource: "User-entered service interval",
      lastServiceKm: draft.lastServiceKm ? Number(draft.lastServiceKm) : null,
      lastServiceAt: null,
      currentOdometerKm: draft.currentOdometerKm ? Number(draft.currentOdometerKm) : null,
    };
    const next = [item, ...items];
    setItems(next);
    saveRecords(MAINT_KEY, next);
    setDraft({ name: "", intervalKm: "", lastServiceKm: "", currentOdometerKm: "" });
  };

  const vehicleEvents = activeVehicleId ? events : events;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Vehicle Health & Events</h1>
        <p className="text-sm text-muted-foreground">
          Health is stated as evidence, not a score. Events are recorded from real observations only.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold"><HeartPulse className="size-4 text-signal" /> Health assessment</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {assessments.map((assessment) => (
              <li key={assessment.area} className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{assessment.area}</span>
                <span className="text-right">
                  <Badge
                    variant={assessment.state === "FAULT PRESENT" ? "destructive" : "secondary"}
                    className="readout text-[10px]"
                  >
                    {assessment.state}
                  </Badge>
                  <span className="mt-1 block text-[10px] text-muted-foreground">{assessment.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Activity className="size-4" /> Anomaly detection (calculated)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Calculated analytics over recorded real samples — distinct from measured values. Nothing is reported below 20
            samples.
          </p>
          {anomalies.length === 0 ? (
            <p className="readout mt-3 text-sm text-muted-foreground">INSUFFICIENT DATA</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {anomalies.map((anomaly) => (
                <li key={anomaly.signal} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="readout">{anomaly.signal}</span>
                    <Badge variant={anomaly.anomalous ? "destructive" : "secondary"} className="readout text-[10px]">
                      {anomaly.anomalous ? "ANOMALY" : "WITHIN BASELINE"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    measured {anomaly.measuredValue} · baseline {anomaly.baseline} · z {anomaly.deviation} · {anomaly.sampleCount} samples ·
                    confidence {anomaly.confidence}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{anomaly.methodology}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Wrench className="size-4" /> Maintenance intervals</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Only real mileage and intervals you enter are used. Nothing is predicted from generic assumptions.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Item" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <input value={draft.intervalKm} onChange={(e) => setDraft({ ...draft, intervalKm: e.target.value })} placeholder="Interval km" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <input value={draft.lastServiceKm} onChange={(e) => setDraft({ ...draft, lastServiceKm: e.target.value })} placeholder="Last service km" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <input value={draft.currentOdometerKm} onChange={(e) => setDraft({ ...draft, currentOdometerKm: e.target.value })} placeholder="Current km" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          <button onClick={addItem} className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-background">Add</button>
        </div>
        {items.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {items.map((item) => {
              const status = maintenanceStatus(item);
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant={status.state === "DUE" ? "destructive" : "secondary"} className="readout text-[10px]">{status.state}</Badge>
                  <span className="readout ml-auto text-xs text-muted-foreground">
                    {status.state === "INSUFFICIENT DATA" ? status.missing : `${status.remainingKm} km remaining`} · {item.intervalSource}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Event log</h2>
        {vehicleEvents.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">No real events recorded</p>
        ) : (
          <ul className="readout mt-3 max-h-72 space-y-1 overflow-auto text-xs">
            {vehicleEvents.map((event) => (
              <li key={event.id}>
                {new Date(event.timestamp).toLocaleString()} · {event.kind} · {event.detail} · {event.source}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

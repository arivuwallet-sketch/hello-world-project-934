import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, FileText, History, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useObd } from "@/lib/obd/store";
import { DTC_DB_SIZE, lookupDtc } from "@/lib/obd/dtc";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";
import { exportSessionCsv, exportSessionPdf } from "@/lib/obd/export";

export const Route = createFileRoute("/sessions")({
  validateSearch: (search: Record<string, unknown>) => ({
    vehicle: typeof search["vehicle"] === "string" ? (search["vehicle"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Scan Sessions & Reports — TorqueDeck" },
      {
        name: "description",
        content:
          "Trip and scan session history with fault codes, peak live values and a printable PDF report for each visit.",
      },
      { property: "og:title", content: "Scan Sessions & Reports — TorqueDeck" },
      {
        property: "og:description",
        content: "Saved diagnostic sessions with codes, peaks and printable reports.",
      },
    ],
  }),
  component: SessionsPage,
});

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function SessionsPage() {
  const { sessions, saveSession, deleteSession, state, vehicles, vehicleCodeHistory } = useObd();
  const { vehicle: vehicleFilter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [notes, setNotes] = useState("");
  const [technician, setTechnician] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const car = vehicleFilter ? vehicles.find((v) => v.id === vehicleFilter) : undefined;
  const shown = vehicleFilter ? sessions.filter((s) => s.vehicleId === vehicleFilter) : sessions;
  const carHistory = vehicleFilter ? vehicleCodeHistory(vehicleFilter) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide">
            {car ? `${car.nickname || `${car.make} ${car.model}`.trim()} history` : "Sessions"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {car
              ? "Sessions and fault codes filed against this vehicle only."
              : "Snapshot the current scan, then print any session as a PDF report."}
          </p>
          {car && (
            <button
              className="mt-1 text-xs uppercase tracking-wider text-signal"
              onClick={() => void navigate({ search: { vehicle: undefined } })}
            >
              Show all vehicles
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Session notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-56"
          />
          <Button
            disabled={state !== "connected"}
            onClick={() => {
              saveSession(notes);
              setNotes("");
            }}
          >
            <Save className="size-4" /> Save current
          </Button>
          <Input
            placeholder="Technician name"
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
            className="w-44"
          />
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Print view
          </Button>
        </div>
      </header>

      {car && carHistory.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-sm font-semibold tracking-wide">Fault code history</h2>
          <ul className="mt-2 divide-y divide-border/60">
            {carHistory.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-2 py-1.5 text-sm">
                <span className="readout font-semibold text-signal">{e.code}</span>
                <span className="text-muted-foreground">{lookupDtc(e.code).title}</span>
                <span className="readout ml-auto text-xs text-muted-foreground">
                  {e.kind} · seen {e.count}× · last {fmt(e.lastSeen)}
                  {e.clearedAt ? ` · cleared ${fmt(e.clearedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <History className="mx-auto mb-3 size-8 opacity-50" />
          {car
            ? "No sessions saved for this vehicle yet. Select it in the Garage, then save a scan."
            : "No saved sessions yet. Connect an adapter and press Save current (or G)."}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((s) => {
            const open = openId === s.id;
            const mins = Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000));
            return (
              <article key={s.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display font-semibold tracking-wide">{s.vehicleLabel}</h2>
                    <div className="readout text-xs text-muted-foreground">
                      {fmt(s.startedAt)} · {mins} min · {s.samples} samples
                    </div>
                  </div>
                  <div className="no-print flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(open ? null : s.id)}>
                      {open ? "Hide detail" : "View detail"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => exportSessionCsv(s)}>
                      <FileSpreadsheet className="size-3.5" /> CSV
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => exportSessionPdf(s, technician)}>
                      <FileText className="size-3.5" /> PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => deleteSession(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="readout mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>Protocol: {s.protocol}</div>
                  <div>Adapter: {s.adapter}</div>
                  <div>VIN: {s.vin ?? "—"}</div>
                  <div>
                    Codes: {s.dtcs.length} stored · {s.pending.length} pending
                  </div>
                </div>
                {s.notes && <p className="mt-2 text-sm">{s.notes}</p>}

                {open && (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Fault codes
                      </h3>
                      {s.dtcs.length + s.pending.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">No codes recorded.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {[...s.dtcs, ...s.pending].map((code) => {
                            const info = lookupDtc(code);
                            return (
                              <li key={code} className="text-sm">
                                <span className="readout font-bold">{code}</span>{" "}
                                <span className="text-muted-foreground">{info.title}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Peak live values
                      </h3>
                      <div className="readout mt-2 grid gap-1 text-sm sm:grid-cols-3">
                        {Object.entries(s.maxima).map(([id, v]) => {
                          const def = PID_BY_ID[id as PidId];
                          if (!def || v == null) return null;
                          return (
                            <div key={id}>
                              <span className="text-muted-foreground">{def.label}: </span>
                              {Math.round(v * 10) / 10} {def.unit}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="no-print text-xs text-muted-foreground">
        {DTC_DB_SIZE} curated reference entries are available. Unknown codes are never guessed.
      </p>
    </div>
  );
}

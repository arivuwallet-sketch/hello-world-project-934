import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { loadDiagSessions, type DiagSession } from "@/lib/obd/diag-sessions";
import { compareRepair } from "@/lib/obd/repair-comparison";

export const Route = createFileRoute("/repair-comparison")({
  head: () => ({
    meta: [
      { title: "Before / After Repair Comparison | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Compares two real diagnostic sessions code by code. A code that stopped appearing is reported as not reported, never as fixed.",
      },
      { property: "og:title", content: "Before / After Repair Comparison | Vehicle Insight Hub" },
      { property: "og:description", content: "Verification requires a real second scan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RepairComparisonPage,
});

function label(session: DiagSession) {
  return `${session.workOrderId || "—"} · ${new Date(session.startedAt).toLocaleString()} · ${session.state}`;
}

function RepairComparisonPage() {
  const [sessions, setSessions] = useState<DiagSession[]>([]);
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [clearRecorded, setClearRecorded] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => setSessions(loadDiagSessions()), []);

  const before = sessions.find((session) => session.id === beforeId) ?? null;
  const after = sessions.find((session) => session.id === afterId) ?? null;

  const comparison = useMemo(
    () => (before ? compareRepair(before, after, { clearRecorded, notes }) : null),
    [before, after, clearRecorded, notes],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Before / after repair comparison</h1>
        <p className="text-sm text-muted-foreground">
          Two recorded sessions are compared field by field. Only a recorded clear operation lets a code be reported as
          cleared.
        </p>
      </header>

      <section className="panel space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted-foreground">Before repair session</span>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={beforeId}
              onChange={(e) => setBeforeId(e.target.value)}
            >
              <option value="">Select a recorded session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>{label(session)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">After repair session</span>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={afterId}
              onChange={(e) => setAfterId(e.target.value)}
            >
              <option value="">Not available yet</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>{label(session)}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clearRecorded} onChange={(e) => setClearRecorded(e.target.checked)} />
          A real clear-codes operation was recorded between these scans
        </label>
        <Input placeholder="Technician notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {!comparison ? (
        <p className="panel readout p-8 text-center text-sm text-muted-foreground">
          SELECT A BEFORE-REPAIR SESSION TO COMPARE
        </p>
      ) : (
        <>
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ArrowLeftRight className="size-4 text-signal" /> Fault codes
            </h2>
            {comparison.dtcs.length === 0 ? (
              <p className="readout mt-3 text-sm text-muted-foreground">NO CODES RECORDED IN EITHER SESSION</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {comparison.dtcs.map((item) => (
                  <li key={`${item.kind}-${item.code}`} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="readout font-bold">{item.code}</span>
                      <Badge variant="outline" className="readout text-[10px]">{item.kind}</Badge>
                      <Badge
                        variant={item.verdict === "DTC STILL PRESENT" ? "destructive" : "secondary"}
                        className="readout ml-auto text-[10px]"
                      >
                        {item.verdict}
                      </Badge>
                    </div>
                    <p className="readout mt-1 text-xs text-muted-foreground">
                      BEFORE: {item.before} · AFTER: {item.after}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">Session evidence</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {comparison.fields.map((field) => (
                <li key={field.label} className="flex flex-wrap items-baseline gap-2 border-b border-border/60 py-1.5">
                  <span className="w-40 text-muted-foreground">{field.label}</span>
                  <span className="readout">{field.before ?? "NOT RECORDED"}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="readout">{field.after ?? "VERIFICATION NOT AVAILABLE"}</span>
                  {field.changed != null && (
                    <Badge variant="outline" className="readout ml-auto text-[10px]">
                      {field.changed ? "CHANGED" : "UNCHANGED"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            {comparison.notes && <p className="mt-3 text-sm">Notes: {comparison.notes}</p>}
          </section>
        </>
      )}
    </div>
  );
}

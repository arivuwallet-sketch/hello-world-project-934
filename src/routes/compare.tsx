import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useObd, type SessionRecord } from "@/lib/obd/store";
import { lookupDtc } from "@/lib/obd/dtc";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Before / After Session Comparison — TorqueDeck" },
      {
        name: "description",
        content:
          "Compare two saved scan sessions for the same vehicle to see which fault codes cleared, which are new and how live readings changed after a repair.",
      },
      { property: "og:title", content: "Before / After Session Comparison — TorqueDeck" },
      {
        property: "og:description",
        content: "Confirm a repair by diffing two saved OBD-II scan sessions for the same car.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function avg(samples: { v: number }[] | undefined) {
  if (!samples || samples.length === 0) return null;
  return samples.reduce((a, s) => a + s.v, 0) / samples.length;
}

function Codes({ title, codes, tone }: { title: string; codes: string[]; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {codes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {codes.map((c) => (
            <li key={c} className="text-sm">
              <span className={`readout font-bold ${tone}`}>{c}</span>{" "}
              <span className="text-muted-foreground">{lookupDtc(c).title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComparePage() {
  const { sessions, vehicles } = useObd();
  const [vehicleId, setVehicleId] = useState<string>(sessions[0]?.vehicleId ?? "");
  const forVehicle = useMemo(
    () => sessions.filter((s) => (s.vehicleId ?? "") === vehicleId),
    [sessions, vehicleId],
  );
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");

  const before = forVehicle.find((s) => s.id === beforeId);
  const after = forVehicle.find((s) => s.id === afterId);

  const diff = useMemo(() => {
    if (!before || !after) return null;
    const b = new Set([...before.dtcs, ...before.pending]);
    const a = new Set([...after.dtcs, ...after.pending]);
    const rows: { id: PidId; label: string; unit: string; b: number | null; a: number | null }[] = [];
    const ids = new Set([...Object.keys(before.log ?? {}), ...Object.keys(after.log ?? {})]) as Set<PidId>;
    for (const id of ids) {
      const def = PID_BY_ID[id];
      if (!def) continue;
      rows.push({ id, label: def.label, unit: def.unit, b: avg(before.log?.[id]), a: avg(after.log?.[id]) });
    }
    return {
      cleared: [...b].filter((c) => !a.has(c)),
      persisting: [...b].filter((c) => a.has(c)),
      added: [...a].filter((c) => !b.has(c)),
      rows: rows.sort((x, y) => x.label.localeCompare(y.label)),
    };
  }, [before, after]);

  const label = (s: SessionRecord) => `${fmt(s.startedAt)} · ${s.dtcs.length} stored`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-wide">Before / after comparison</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick two saved sessions for the same vehicle to confirm whether a repair actually changed anything.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Vehicle</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              setBeforeId("");
              setAfterId("");
            }}
          >
            <option value="">Unassigned</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nickname || `${v.make} ${v.model}`.trim() || v.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Before</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={beforeId}
            onChange={(e) => setBeforeId(e.target.value)}
          >
            <option value="">Select a session</option>
            {forVehicle.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">After</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={afterId}
            onChange={(e) => setAfterId(e.target.value)}
          >
            <option value="">Select a session</option>
            {forVehicle.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!diff ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <ArrowLeftRight className="mx-auto mb-3 size-8 opacity-50" />
          Choose a before and an after session to see the difference.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Codes title="Cleared since before" codes={diff.cleared} tone="text-ok" />
            <Codes title="Still present" codes={diff.persisting} tone="text-warn" />
            <Codes title="New in after" codes={diff.added} tone="text-danger" />
          </div>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-display text-sm font-semibold tracking-wide">Live value averages</h2>
            {diff.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Neither session recorded live samples, so there is nothing to compare.
              </p>
            ) : (
              <table className="readout mt-3 w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left">Reading</th>
                    <th className="py-1 text-right">Before</th>
                    <th className="py-1 text-right">After</th>
                    <th className="py-1 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.rows.map((r) => {
                    const delta = r.b != null && r.a != null ? r.a - r.b : null;
                    return (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="py-1.5">{r.label}</td>
                        <td className="py-1.5 text-right">{r.b == null ? "—" : `${Math.round(r.b * 10) / 10} ${r.unit}`}</td>
                        <td className="py-1.5 text-right">{r.a == null ? "—" : `${Math.round(r.a * 10) / 10} ${r.unit}`}</td>
                        <td
                          className={`py-1.5 text-right ${
                            delta == null ? "" : delta > 0 ? "text-warn" : delta < 0 ? "text-signal" : ""
                          }`}
                        >
                          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Averages come from the samples each session actually recorded. Different drive conditions change these
              numbers, so treat a difference as evidence to check, not proof on its own.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

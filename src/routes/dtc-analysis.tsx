import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Microscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { lookupDtc } from "@/lib/obd/dtc";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";
import { assessEvidence, correlateSignal, type DtcDescription } from "@/lib/obd/correlation";

export const Route = createFileRoute("/dtc-analysis")({
  head: () => ({
    meta: [
      { title: "DTC Correlation & Evidence | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Correlate a real fault code with the freeze frame and the telemetry recorded around it, with sourced descriptions and explicit uncertainty.",
      },
      { property: "og:title", content: "DTC Correlation & Evidence | Vehicle Insight Hub" },
      { property: "og:description", content: "Observed evidence and possible interpretations — never a component verdict." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DtcAnalysisPage,
});

function DtcAnalysisPage() {
  const { dtcs, pendingDtcs, permanentDtcs, freeze, history, codeHistory, activePids } = useObd();
  const all = [...new Set([...dtcs, ...pendingDtcs, ...permanentDtcs])];
  const [selected, setSelected] = useState<string | null>(all[0] ?? null);
  const code = selected && all.includes(selected) ? selected : (all[0] ?? null);

  const entry = code ? codeHistory.find((c) => c.code === code) : undefined;
  const eventAt = entry?.firstSeen ?? Date.now();

  const windows = useMemo(
    () =>
      (activePids as PidId[]).map((id) =>
        correlateSignal(PID_BY_ID[id]?.label ?? id, PID_BY_ID[id]?.unit ?? "", history[id], eventAt),
      ),
    [activePids, history, eventAt],
  );

  const freezeValues = code && freeze?.dtc === code ? freeze.values : freeze && !freeze.dtc ? freeze.values : [];
  const assessment = code ? assessEvidence({ code, freezeFrame: freezeValues, windows }) : null;

  const descriptions: DtcDescription[] = code
    ? [
        {
          provenance: "STANDARD",
          text: lookupDtc(code).definitionAvailable
            ? `${lookupDtc(code).title} — ${lookupDtc(code).meaning}`
            : "NO STANDARD DEFINITION AVAILABLE FOR THIS CODE",
          sourceName: "Built-in standardised DTC table (SAE J2012 structure)",
          sourceUrl: "https://www.sae.org/standards/content/j2012_201612/",
        },
      ]
    : [];

  if (!code) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold">DTC Correlation & Evidence</h1>
        </header>
        <p className="panel readout p-5 text-sm text-muted-foreground">
          NO FAULT CODES READ FROM THE VEHICLE — read codes first, then return here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">DTC Correlation & Evidence</h1>
        <p className="text-sm text-muted-foreground">
          Correlates a code the vehicle actually reported with the data actually recorded around it.
        </p>
      </header>

      <div className="panel flex flex-wrap gap-2 p-4">
        {all.map((c) => (
          <Button key={c} size="sm" variant={c === code ? "default" : "outline"} onClick={() => setSelected(c)}>
            {c}
          </Button>
        ))}
      </div>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Microscope className="size-4 text-signal" /> {code} — descriptions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {descriptions.map((d) => (
            <li key={d.provenance} className="rounded-md border border-border p-3">
              <Badge variant="secondary" className="readout text-[10px]">{d.provenance}</Badge>
              <p className="mt-2">{d.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Source: {d.sourceName}
                {d.sourceUrl && (
                  <>
                    {" · "}
                    <a className="underline" href={d.sourceUrl} target="_blank" rel="noreferrer">reference</a>
                  </>
                )}
              </p>
            </li>
          ))}
          <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            COMMUNITY and MANUFACTURER descriptions appear here once a licensed description dataset is imported on Data
            Sources. Nothing is written in on their behalf.
          </li>
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Evidence timeline</h2>
        <p className="readout mt-2 text-xs text-muted-foreground">
          Code first recorded {entry ? new Date(entry.firstSeen).toLocaleString() : "TIMESTAMP UNAVAILABLE"}
        </p>
        <h3 className="mt-4 text-sm font-semibold">Freeze frame</h3>
        {freezeValues.length === 0 ? (
          <p className="readout mt-1 text-sm text-muted-foreground">FREEZE FRAME UNAVAILABLE</p>
        ) : (
          <dl className="readout mt-1 grid gap-x-6 text-sm sm:grid-cols-2">
            {freezeValues.map((v) => (
              <div key={v.label} className="flex justify-between border-b border-border/40 py-1">
                <dt className="text-muted-foreground">{v.label}</dt>
                <dd>{v.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <h3 className="mt-4 text-sm font-semibold">Near-event live data</h3>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left">Signal</th>
                <th className="py-1 text-right">Samples before</th>
                <th className="py-1 text-right">Samples after</th>
                <th className="py-1 text-right">Nearest sample</th>
                <th className="py-1 text-left pl-3">Availability</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.signal} className="border-t border-border/50">
                  <td className="py-1.5">{w.signal}</td>
                  <td className="readout py-1.5 text-right">{w.before.length}</td>
                  <td className="readout py-1.5 text-right">{w.after.length}</td>
                  <td className="readout py-1.5 text-right">
                    {w.timeDistanceMs === null ? "—" : `${(w.timeDistanceMs / 1000).toFixed(1)} s`}
                  </td>
                  <td className="readout py-1.5 pl-3">{w.availability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {assessment && (
        <section className="panel p-5">
          <h2 className="font-semibold">Assessment</h2>
          <Badge variant={assessment.conclusion === "OBSERVED EVIDENCE ONLY" ? "default" : "secondary"} className="readout mt-2 text-[10px]">
            {assessment.conclusion}
          </Badge>
          <Block title="Observed evidence" items={assessment.observed} empty="No evidence was recorded around this code." />
          <Block title="Possible interpretations" items={assessment.interpretations} empty="Not offered — the recorded evidence is insufficient." />
          <Block title="Missing tests" items={assessment.missingTests} empty="None outstanding." />
          <p className="mt-3 text-sm">
            <span className="font-semibold">Recommended next test: </span>
            {assessment.recommendedNextTest ?? "DATA UNAVAILABLE"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Uncertainty: {assessment.uncertainty}</p>
        </section>
      )}
    </div>
  );
}

function Block({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="readout mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

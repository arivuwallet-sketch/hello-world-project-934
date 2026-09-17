import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useObd } from "@/lib/obd/store";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";
import {
  EvidenceRecorder,
  captureToCsv,
  captureToJson,
  type EvidenceCapture,
  type TriggerComparison,
  type TriggerDefinition,
} from "@/lib/obd/triggers";
import { loadRecords, saveRecords, newId, sha256Hex } from "@/lib/obd/persist";

export const Route = createFileRoute("/evidence-recorder")({
  head: () => ({
    meta: [
      { title: "Triggered Evidence Recorder | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Define thresholds on real signals and capture pre- and post-trigger evidence with raw responses, ECU, PID and a SHA-256 hash on export.",
      },
      { property: "og:title", content: "Triggered Evidence Recorder | Vehicle Insight Hub" },
      { property: "og:description", content: "Triggers fire only from measurements the vehicle actually returned." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EvidenceRecorderPage,
});

const KEY = "obd.triggers";

const COMPARISONS: { value: TriggerComparison; label: string; needsSignal: boolean }[] = [
  { value: "greater", label: "value rises above", needsSignal: true },
  { value: "less", label: "value falls below", needsSignal: true },
  { value: "changes-by", label: "value changes by at least", needsSignal: true },
  { value: "dtc-appears", label: "a fault code appears", needsSignal: false },
  { value: "dtc-clears", label: "a fault code clears", needsSignal: false },
  { value: "response-failure", label: "an ECU response fails", needsSignal: false },
  { value: "connection-loss", label: "the connection is lost", needsSignal: false },
];

function EvidenceRecorderPage() {
  const { state, live, signalDetails, activePids, dtcs, protocolName } = useObd();
  const [triggers, setTriggers] = useState<TriggerDefinition[]>(() => loadRecords<TriggerDefinition>(KEY));
  const [captures, setCaptures] = useState<EvidenceCapture[]>([]);
  const [draft, setDraft] = useState({ name: "", signal: "" as PidId | "", comparison: "greater" as TriggerComparison, threshold: "", pre: "10", post: "20" });
  const recorder = useMemo(() => new EvidenceRecorder(), []);
  const lastDtcs = useRef<string[]>([]);

  useEffect(() => saveRecords(KEY, triggers), [triggers]);

  // Feed the recorder from real decoded readings only.
  useEffect(() => {
    if (state !== "connected") return;
    for (const id of activePids) {
      const detail = signalDetails[id];
      const value = live[id];
      if (!detail || value === undefined) continue;
      const fired = recorder.push(
        {
          timestamp: detail.timestamp,
          signal: id,
          value,
          unit: detail.unit,
          ecu: detail.ecu,
          pid: detail.pid,
          canId: detail.canId,
          rawResponse: detail.rawResponse,
          protocol: protocolName || null,
          quality: detail.quality,
        },
        triggers,
      );
      if (fired.length > 0) {
        setCaptures((cur) => [...fired, ...cur].slice(0, 40));
        for (const capture of fired) toast.warning(`Trigger fired: ${capture.cause}`);
      }
    }
  }, [live, signalDetails, activePids, triggers, state, protocolName, recorder]);

  useEffect(() => {
    const previous = lastDtcs.current;
    const appeared = dtcs.filter((c) => !previous.includes(c));
    const cleared = previous.filter((c) => !dtcs.includes(c));
    if (appeared.length > 0) setCaptures((cur) => [...recorder.event("dtc-appears", `Code appeared: ${appeared.join(", ")}`, triggers), ...cur]);
    if (cleared.length > 0) setCaptures((cur) => [...recorder.event("dtc-clears", `Code cleared: ${cleared.join(", ")}`, triggers), ...cur]);
    lastDtcs.current = dtcs;
  }, [dtcs, triggers, recorder]);

  useEffect(() => {
    if (state === "disconnected") {
      const fired = recorder.event("connection-loss", "CONNECTION LOST", triggers);
      if (fired.length > 0) setCaptures((cur) => [...fired, ...cur]);
    }
  }, [state, triggers, recorder]);

  const addTrigger = () => {
    const spec = COMPARISONS.find((c) => c.value === draft.comparison)!;
    if (spec.needsSignal && (!draft.signal || draft.threshold.trim() === "")) {
      toast.error("A threshold trigger needs a signal and a numeric threshold");
      return;
    }
    const detail = draft.signal ? PID_BY_ID[draft.signal] : undefined;
    setTriggers((cur) => [
      ...cur,
      {
        id: newId(),
        name: draft.name.trim() || `${detail?.label ?? spec.label} trigger`,
        signal: spec.needsSignal ? draft.signal || null : null,
        comparison: draft.comparison,
        threshold: spec.needsSignal ? Number(draft.threshold) : null,
        unit: detail?.unit ?? null,
        preSeconds: Math.max(0, Number(draft.pre) || 0),
        postSeconds: Math.max(0, Number(draft.post) || 0),
        enabled: true,
      },
    ]);
    setDraft({ ...draft, name: "", threshold: "" });
  };

  const exportCapture = async (capture: EvidenceCapture, format: "json" | "csv") => {
    const payload = format === "json" ? captureToJson(capture) : captureToCsv(capture);
    const hash = await sha256Hex(new TextEncoder().encode(payload));
    const blob = new Blob([`${payload}\n${format === "csv" ? "#" : "//"} sha256=${hash}`], {
      type: format === "json" ? "application/json" : "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-${capture.id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setCaptures((cur) => cur.map((c) => (c.id === capture.id ? { ...c, hash } : c)));
    toast.success(`Exported with SHA-256 ${hash.slice(0, 16)}…`);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Triggered Evidence Recorder</h1>
        <p className="text-sm text-muted-foreground">
          Triggers evaluate the measurements actually arriving from the vehicle. A capture keeps the real samples before
          and after the event, including each raw response.
        </p>
      </header>

      <section className="panel grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="sm:col-span-2">
          <Label className="text-xs">Trigger name</Label>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Coolant over 105 °C" />
        </div>
        <div>
          <Label className="text-xs">Condition</Label>
          <Select value={draft.comparison} onValueChange={(v) => setDraft({ ...draft, comparison: v as TriggerComparison })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMPARISONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Signal</Label>
          <Select value={draft.signal} onValueChange={(v) => setDraft({ ...draft, signal: v as PidId })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {activePids.map((id) => (
                <SelectItem key={id} value={id}>{PID_BY_ID[id]?.label ?? id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Threshold</Label>
          <Input value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} inputMode="decimal" />
        </div>
        <div className="flex gap-2">
          <div>
            <Label className="text-xs">Pre (s)</Label>
            <Input value={draft.pre} onChange={(e) => setDraft({ ...draft, pre: e.target.value })} inputMode="numeric" />
          </div>
          <div>
            <Label className="text-xs">Post (s)</Label>
            <Input value={draft.post} onChange={(e) => setDraft({ ...draft, post: e.target.value })} inputMode="numeric" />
          </div>
        </div>
        <div className="sm:col-span-3 lg:col-span-6">
          <Button size="sm" onClick={addTrigger}>Add trigger</Button>
          <Badge variant="secondary" className="readout ml-3 text-[10px]">
            {state === "connected" ? `${recorder.bufferedSamples()} REAL SAMPLES BUFFERED` : "OBD ADAPTER NOT CONNECTED"}
          </Badge>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Triggers</h2>
        {triggers.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">No triggers defined.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {triggers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                <CircleDot className={`size-4 ${t.enabled ? "text-signal" : "text-muted-foreground"}`} />
                <span className="font-medium">{t.name}</span>
                <span className="readout text-xs text-muted-foreground">
                  {t.signal ? `${t.signal} ${t.comparison} ${t.threshold ?? ""}${t.unit ?? ""}` : t.comparison}
                  {" · "}−{t.preSeconds}s / +{t.postSeconds}s
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setTriggers((cur) => cur.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)))}>
                    {t.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTriggers((cur) => cur.filter((x) => x.id !== t.id))}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Captures</h2>
        {captures.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">No trigger has fired from real data yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {captures.map((capture) => (
              <li key={capture.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{capture.triggerName}</span>
                  <span className="readout text-xs text-warn">{capture.cause}</span>
                  <span className="readout ml-auto text-xs text-muted-foreground">
                    {new Date(capture.firedAt).toLocaleTimeString()} · {capture.preSamples.length} pre / {capture.postSamples.length} post
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void exportCapture(capture, "json")}>
                    <Download className="mr-2 size-4" /> JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void exportCapture(capture, "csv")}>
                    <Download className="mr-2 size-4" /> CSV
                  </Button>
                  {capture.hash && <span className="readout text-xs text-muted-foreground">sha256 {capture.hash.slice(0, 24)}…</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

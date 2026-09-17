import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useObd } from "@/lib/obd/store";
import {
  applyObservation,
  loadPlans,
  planConclusion,
  savePlans,
  standardEvidencePlan,
  type DiagnosticPlan,
  type ObservationOrigin,
  type StepStatus,
} from "@/lib/obd/guided";

export const Route = createFileRoute("/guided-diagnostics")({
  head: () => ({
    meta: [
      { title: "Guided Diagnostics | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Evidence-tree diagnostic plans with prerequisites, safety conditions, expected versus observed results and explicit insufficient-data conclusions.",
      },
      { property: "og:title", content: "Guided Diagnostics | Vehicle Insight Hub" },
      { property: "og:description", content: "Expected results are never auto-filled from observed results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuidedDiagnosticsPage,
});

const STATUS_TONE: Record<StepStatus, "default" | "secondary" | "destructive" | "outline"> = {
  "NOT STARTED": "secondary",
  "IN PROGRESS": "outline",
  "WAITING FOR DATA": "outline",
  "WAITING FOR MEASUREMENT": "outline",
  PASS: "default",
  FAIL: "destructive",
  INCONCLUSIVE: "secondary",
  UNSUPPORTED: "secondary",
  COMPLETED: "default",
};

function GuidedDiagnosticsPage() {
  const { dtcs, pendingDtcs, live, signalDetails } = useObd();
  const [plans, setPlans] = useState<DiagnosticPlan[]>(() => loadPlans());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const codes = [...new Set([...dtcs, ...pendingDtcs])];

  useEffect(() => savePlans(plans), [plans]);
  const plan = plans.find((p) => p.id === activeId) ?? plans[0] ?? null;

  const update = (updated: DiagnosticPlan) =>
    setPlans((cur) => cur.map((p) => (p.id === updated.id ? { ...updated, conclusion: planConclusion(updated.steps) } : p)));

  const record = (stepId: string, origin: ObservationOrigin, status: "PASS" | "FAIL" | "INCONCLUSIVE" | "UNSUPPORTED") => {
    if (!plan) return;
    const value = draft[stepId] ?? "";
    update({
      ...plan,
      steps: plan.steps.map((s) => (s.id === stepId ? applyObservation(s, value, origin, status) : s)),
    });
  };

  const captureLive = (stepId: string) => {
    const entries = Object.entries(live).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      toast.error("No live measurement is available to record");
      return;
    }
    const text = entries
      .map(([id, value]) => `${id}=${value}${signalDetails[id as keyof typeof signalDetails]?.unit ?? ""}`)
      .join("  ");
    setDraft((cur) => ({ ...cur, [stepId]: text }));
    toast.success("Recorded the current live values as the observation");
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Guided Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          An evidence tree, not an answer machine. Expected results are authored with the plan; observed results only
          ever come from live data or from you.
        </p>
      </header>

      <div className="panel flex flex-wrap items-center gap-2 p-4">
        {codes.length === 0 ? (
          <span className="readout text-xs text-muted-foreground">NO FAULT CODES READ — read codes to start a plan for one</span>
        ) : (
          codes.map((code) => (
            <Button
              key={code}
              size="sm"
              variant="outline"
              onClick={() => {
                const created = standardEvidencePlan(code);
                setPlans((cur) => [created, ...cur]);
                setActiveId(created.id);
              }}
            >
              Start plan for {code}
            </Button>
          ))
        )}
        {plans.length > 0 && (
          <select
            className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={plan?.id ?? ""}
            onChange={(e) => setActiveId(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {!plan ? (
        <p className="panel readout p-5 text-sm text-muted-foreground">No diagnostic plan is open.</p>
      ) : (
        <>
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold"><GitBranch className="size-4 text-signal" /> {plan.name}</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row label="Source" value={plan.sourceName} />
              <Row label="Licence" value={plan.license ?? "NOT EXTERNALLY SOURCED"} />
              <Row label="Version" value={plan.version} />
              <Row label="Applicability" value={plan.applicability} />
            </dl>
            <List title="Prerequisites" items={plan.prerequisites} />
            <List title="Required tools" items={plan.requiredTools} />
            <List title="Required measurements" items={plan.requiredMeasurements} />
            <List title="Safety conditions" items={plan.safetyConditions} />
            <Badge variant="secondary" className="readout mt-3 text-[10px]">
              {plan.conclusion ?? "INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION"}
            </Badge>
          </section>

          <ol className="space-y-3">
            {plan.steps.map((step, index) => (
              <li key={step.id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="readout text-xs text-muted-foreground">STEP {index + 1}</span>
                  <span className="font-semibold">{step.title}</span>
                  <Badge variant={STATUS_TONE[step.status]} className="readout ml-auto text-[10px]">{step.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{step.instruction}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">EXPECTED (authored with the plan)</p>
                    <p className="readout mt-1 text-sm">{step.expected}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      OBSERVED {step.observedOrigin ? `— ${step.observedOrigin}` : "— not recorded"}
                    </p>
                    <p className="readout mt-1 text-sm">{step.observed ?? "AWAITING A REAL OBSERVATION"}</p>
                  </div>
                </div>
                <Input
                  className="mt-3"
                  placeholder="Record what you actually observed or measured"
                  value={draft[step.id] ?? ""}
                  onChange={(e) => setDraft((cur) => ({ ...cur, [step.id]: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => record(step.id, "USER ENTERED", "PASS")}>Record as pass</Button>
                  <Button size="sm" variant="destructive" onClick={() => record(step.id, "USER ENTERED", "FAIL")}>Record as fail</Button>
                  <Button size="sm" variant="outline" onClick={() => record(step.id, "USER ENTERED", "INCONCLUSIVE")}>Inconclusive</Button>
                  <Button size="sm" variant="ghost" onClick={() => record(step.id, "USER ENTERED", "UNSUPPORTED")}>Unsupported</Button>
                  {step.requires === "live-data" && (
                    <Button size="sm" variant="outline" onClick={() => captureLive(step.id)}>Capture live values</Button>
                  )}
                </div>
                <Textarea
                  className="mt-3"
                  placeholder="Technician notes"
                  value={step.notes}
                  onChange={(e) =>
                    update({ ...plan, steps: plan.steps.map((s) => (s.id === step.id ? { ...s, notes: e.target.value } : s)) })
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Branches: {step.branches.map((b) => `${b.outcome} → ${b.next}`).join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="readout text-right">{value}</dd>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-muted-foreground">{title.toUpperCase()}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useObd } from "@/lib/obd/store";
import {
  LIFECYCLE_STEPS,
  SESSION_STATES,
  canSendCommands,
  createDiagSession,
  deleteSessionRecord,
  loadDiagSessions,
  transitionSession,
  updateSession,
  type DiagSession,
  type DiagSessionState,
} from "@/lib/obd/diag-sessions";

export const Route = createFileRoute("/diagnostic-sessions")({
  head: () => ({
    meta: [
      { title: "Diagnostic Session Manager | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Work order to final report: a diagnostic session lifecycle that records the real adapter, protocol, ECUs, codes, tests and reports of each visit.",
      },
      { property: "og:title", content: "Diagnostic Session Manager | Vehicle Insight Hub" },
      { property: "og:description", content: "Completed sessions become read-only evidence, never live again." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiagSessionsPage,
});

function DiagSessionsPage() {
  const { state, adapterName, transport, protocolName, vin, ecus, dtcs, pendingDtcs, permanentDtcs } = useObd();
  const [sessions, setSessions] = useState<DiagSession[]>([]);
  const [workOrder, setWorkOrder] = useState("");
  const [technician, setTechnician] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setSessions(loadDiagSessions()), []);

  function refresh() {
    setSessions(loadDiagSessions());
  }

  function attachLiveEvidence(id: string) {
    const result = updateSession(id, {
      adapter: state === "connected" ? adapterName || "Adapter identity unavailable" : null,
      transport: transport ?? null,
      protocol: state === "connected" ? protocolName || null : null,
      vin: vin ?? null,
      ecus: ecus.map((ecu) => `${ecu.header} ${ecu.label}`),
      dtcs: [
        ...dtcs.map((code) => ({ code, kind: "stored" as const })),
        ...pendingDtcs.map((code) => ({ code, kind: "pending" as const })),
        ...permanentDtcs.map((code) => ({ code, kind: "permanent" as const })),
      ],
    });
    setNotice(result.ok ? "Live evidence attached from the current connection." : result.reason);
    refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Diagnostic session manager</h1>
        <p className="text-sm text-muted-foreground">
          Each visit runs through the same lifecycle. Evidence is copied from the live connection only — an unconnected
          adapter records nothing.
        </p>
        <p className="readout mt-2 text-xs text-muted-foreground">{LIFECYCLE_STEPS.join(" → ")}</p>
      </header>

      <section className="panel space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardList className="size-4 text-signal" /> Open a session
        </h2>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Work order ID"
            className="w-48"
            value={workOrder}
            onChange={(e) => setWorkOrder(e.target.value)}
          />
          <Input
            placeholder="Technician"
            className="w-48"
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
          />
          <Button
            disabled={!workOrder.trim() || !technician.trim()}
            onClick={() => {
              createDiagSession({ workOrderId: workOrder, technician, vin: vin ?? null });
              setWorkOrder("");
              setNotice("Session created.");
              refresh();
            }}
          >
            Create session
          </Button>
        </div>
        {notice && <p className="readout text-xs text-muted-foreground">{notice}</p>}
      </section>

      {sessions.length === 0 ? (
        <p className="panel readout p-8 text-center text-sm text-muted-foreground">NO DIAGNOSTIC SESSIONS RECORDED</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <article key={session.id} className="panel p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">Work order {session.workOrderId || "—"}</h2>
                <Badge variant="outline" className="readout text-[10px]">{session.state}</Badge>
                {session.historical && (
                  <Badge variant="secondary" className="readout text-[10px]">RECORDED DATA — NOT LIVE</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-danger"
                  onClick={() => {
                    deleteSessionRecord(session.id);
                    refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="readout mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Session: {session.id.slice(0, 8)}</div>
                <div>Technician: {session.technician || "—"}</div>
                <div>Started: {new Date(session.startedAt).toLocaleString()}</div>
                <div>Ended: {session.endedAt ? new Date(session.endedAt).toLocaleString() : "—"}</div>
                <div>Adapter: {session.adapter ?? "NOT RECORDED"}</div>
                <div>Transport: {session.transport ?? "NOT RECORDED"}</div>
                <div>Protocol: {session.protocol ?? "NOT RECORDED"}</div>
                <div>VIN: {session.vin ?? "NOT RECORDED"}</div>
                <div>ECUs: {session.ecus.length === 0 ? "NONE RECORDED" : session.ecus.join(", ")}</div>
                <div>Codes recorded: {session.dtcs.length}</div>
                <div>Commands permitted: {canSendCommands(session) ? "YES" : "NO"}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SESSION_STATES.map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant="secondary"
                    disabled={session.historical || session.state === next}
                    onClick={() => {
                      const result = transitionSession(session.id, next as DiagSessionState);
                      setNotice(result.ok ? `Session moved to ${next}.` : result.reason);
                      refresh();
                    }}
                  >
                    {next}
                  </Button>
                ))}
                <Button
                  size="sm"
                  disabled={session.historical || state !== "connected"}
                  onClick={() => attachLiveEvidence(session.id)}
                >
                  Attach live evidence
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

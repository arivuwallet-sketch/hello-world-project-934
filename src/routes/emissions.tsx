import { createFileRoute } from "@tanstack/react-router";
import { Leaf, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";
import type { PidId } from "@/lib/obd/pids";

export const Route = createFileRoute("/emissions")({
  head: () => ({
    meta: [
      { title: "Emissions Diagnostics | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Oxygen sensors, fuel trims, catalyst, EVAP, EGR and readiness monitors read from the ECU, with unsupported items shown as unavailable.",
      },
      { property: "og:title", content: "Emissions Diagnostics | Vehicle Insight Hub" },
      { property: "og:description", content: "Emissions diagnostics only — no defeat functionality, no monitor disabling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmissionsPage,
});

const GROUPS: { title: string; pids: PidId[] }[] = [
  { title: "Oxygen sensors & lambda", pids: ["o2b1s1", "o2b1s2"] },
  { title: "Fuel trims", pids: ["stft1", "ltft1", "stft2", "ltft2"] },
  { title: "Catalyst temperature", pids: ["catB1S1", "catB2S1", "catB1S2", "catB2S2"] as PidId[] },
  { title: "Air & load", pids: ["maf", "map", "engineLoad", "absLoad", "baro"] },
];

function EmissionsPage() {
  const { state, live, signalDetails, supportedPids, readiness, dtcs, pendingDtcs } = useObd();
  const emissionCodes = [...dtcs, ...pendingDtcs].filter((code) => /^P0[0-4]/.test(code));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Emissions Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Each value below is a real ECU response with its own source. Signals the ECU does not support are not shown as
          zero.
        </p>
      </header>

      <div className="panel flex items-start gap-3 border-danger/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-muted-foreground">
          This module provides diagnostics only. It contains no emissions defeat functionality and never disables
          emissions monitoring.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <article key={group.title} className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Leaf className="size-4 text-signal" /> {group.title}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {group.pids.map((pid) => {
                const detail = signalDetails[pid];
                const value = live[pid];
                const supported = supportedPids.includes(pid);
                return (
                  <li key={pid} className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">{pid}</span>
                    {value == null || !detail ? (
                      <Badge variant="secondary" className="readout text-[10px]">
                        {state !== "connected" ? "OBD ADAPTER NOT CONNECTED" : supported ? "DATA NOT AVAILABLE" : "PID NOT SUPPORTED"}
                      </Badge>
                    ) : (
                      <span className="readout text-right">
                        {value} {detail.unit}
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                          {detail.ecu ?? "ECU —"} · PID {detail.pid} · {detail.quality}
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Readiness monitors</h2>
        {!readiness ? (
          <p className="readout mt-3 text-sm text-muted-foreground">
            {state === "connected" ? "UNKNOWN — monitor status not reported" : "OBD ADAPTER NOT CONNECTED"}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {[...readiness.continuous, ...readiness.nonContinuous].map((monitor) => (
              <li key={monitor.name} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-muted-foreground">{monitor.name}</span>
                <span className="readout text-xs">
                  {!monitor.supported ? "NOT SUPPORTED" : monitor.complete ? "READY" : "NOT READY"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Emissions-related fault codes</h2>
        {emissionCodes.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">
            {state === "connected" ? "No emissions codes reported" : "OBD ADAPTER NOT CONNECTED"}
          </p>
        ) : (
          <ul className="readout mt-3 space-y-1 text-sm">
            {emissionCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          DPF, SCR, NOx and particulate data are manufacturer-specific: OEM DEPENDENT unless an imported definition
          supplies them for this vehicle.
        </p>
      </section>
    </div>
  );
}

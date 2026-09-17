import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: "Safety System Diagnostics | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "ABS, ESC, SRS, braking, steering and ADAS diagnostics from real responding modules, with authorised clearing only where supported.",
      },
      { property: "og:title", content: "Safety System Diagnostics | Vehicle Insight Hub" },
      { property: "og:description", content: "Legitimate safety diagnostics — never functionality that disables a safety system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SafetyPage,
});

const SYSTEMS: { name: string; prefixes: RegExp }[] = [
  { name: "ABS / braking", prefixes: /^C0/ },
  { name: "Electronic stability control", prefixes: /^C1/ },
  { name: "SRS / airbag & restraints", prefixes: /^B0/ },
  { name: "Steering", prefixes: /^C2/ },
  { name: "ADAS & network", prefixes: /^U0/ },
];

function SafetyPage() {
  const { state, ecus, dtcs, pendingDtcs } = useObd();
  const all = [...dtcs, ...pendingDtcs];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Safety System Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Modules and codes shown here were actually returned by the vehicle. Nothing is inferred from the make or model.
        </p>
      </header>

      <div className="panel flex items-start gap-3 border-warn/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <p className="text-muted-foreground">
          Safety systems are read and, where the module supports it and a technician authorises it, cleared. This build
          never offers functionality intended to disable ABS, ESC, restraints or driver assistance.
        </p>
      </div>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-signal" /> Responding modules</h2>
        {ecus.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">
            {state === "connected" ? "No additional modules answered the last scan" : "OBD ADAPTER NOT CONNECTED"}
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {ecus.map((ecu) => (
              <li key={ecu.header} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                <span className="readout">{ecu.header}</span>
                <span className="text-muted-foreground">{ecu.label}</span>
                <span className="readout ml-auto text-xs">
                  {ecu.stored.length} stored · {ecu.pending.length} pending · {ecu.permanent.length} permanent
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {SYSTEMS.map((system) => {
          const codes = all.filter((code) => system.prefixes.test(code));
          return (
            <article key={system.name} className="panel p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{system.name}</h2>
                <Badge variant={codes.length > 0 ? "destructive" : "secondary"} className="readout text-[10px]">
                  {state !== "connected" ? "OBD ADAPTER NOT CONNECTED" : codes.length > 0 ? "FAULT PRESENT" : "NO CODES REPORTED"}
                </Badge>
              </div>
              {codes.length > 0 && (
                <ul className="readout mt-3 space-y-1 text-sm">
                  {codes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Live diagnostic data for this system is manufacturer-specific: OEM DEPENDENT unless an imported
                definition supplies it.
              </p>
            </article>
          );
        })}
      </section>
    </div>
  );
}

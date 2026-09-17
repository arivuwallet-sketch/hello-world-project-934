import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Lock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security Diagnostics | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Read-only visibility of immobiliser, key recognition and ECU authorisation status where the vehicle legitimately exposes it.",
      },
      { property: "og:title", content: "Security Diagnostics | Vehicle Insight Hub" },
      { property: "og:description", content: "Diagnostic visibility only — no bypass, no key programming, no seed-key exploits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

const ITEMS = [
  "Security status",
  "Immobiliser diagnostic status",
  "Key recognition status",
  "ECU authorisation status",
  "Synchronisation status",
];

function SecurityPage() {
  const { state, dtcs, pendingDtcs } = useObd();
  const securityCodes = [...dtcs, ...pendingDtcs].filter((code) => /^(B|U)/.test(code));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Security Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Read-only status where the vehicle legitimately exposes it. Values appear only when an ECU actually answers.
        </p>
      </header>

      <div className="panel flex items-start gap-3 border-danger/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-muted-foreground">
          This module deliberately contains no immobiliser or key bypass, no PIN extraction, no seed-key exploitation and
          no brute-force security access. Protected functions report AUTHORIZED SECURITY ACCESS REQUIRED.
        </p>
      </div>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Lock className="size-4 text-signal" /> Status</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {ITEMS.map((item) => (
            <li key={item} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{item}</span>
              <Badge variant="secondary" className="readout text-[10px]">
                {state === "connected" ? "AUTHORIZED SECURITY ACCESS REQUIRED" : "OBD ADAPTER NOT CONNECTED"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> Security-related fault codes</h2>
        {securityCodes.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">
            {state === "connected" ? "No body or network codes reported" : "OBD ADAPTER NOT CONNECTED"}
          </p>
        ) : (
          <ul className="readout mt-3 space-y-1 text-sm">
            {securityCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

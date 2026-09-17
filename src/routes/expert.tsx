import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CornerDownLeft, ShieldAlert, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { useObd } from "@/lib/obd/store";

export const Route = createFileRoute("/expert")({
  head: () => ({
    meta: [
      { title: "Expert Command Console — TorqueDeck" },
      {
        name: "description",
        content:
          "Send raw ELM327 AT commands and OBD/UDS service requests, including Mode 08 bi-directional control, with a full transaction log.",
      },
      { property: "og:title", content: "Expert Command Console — TorqueDeck" },
      {
        property: "og:description",
        content: "Raw ELM327 and UDS request console with an honest map of what a browser can and cannot do.",
      },
    ],
  }),
  component: ExpertPage,
});

const PRESETS: { cmd: string; label: string; note?: string }[] = [
  { cmd: "ATI", label: "Adapter identity" },
  { cmd: "ATRV", label: "Battery voltage at the port" },
  { cmd: "ATDP", label: "Describe active protocol" },
  { cmd: "0100", label: "Supported PIDs 01-20" },
  { cmd: "0101", label: "Monitor status / MIL" },
  { cmd: "0141", label: "Monitor status this drive cycle" },
  { cmd: "0902", label: "VIN request" },
  { cmd: "0600", label: "Mode 06 supported test IDs" },
  { cmd: "0801", label: "Mode 08 control request", note: "bi-directional" },
  { cmd: "1003", label: "UDS: extended diagnostic session", note: "CAN only" },
  { cmd: "2210F1", label: "UDS: read data by identifier", note: "manufacturer" },
  { cmd: "2701", label: "UDS: security access seed request", note: "manufacturer" },
];

const CAPABILITY = [
  {
    title: "Bi-directional actuation",
    status: "partial" as const,
    body: "Mode 08 requests are sent verbatim from this console and the ECU's reply is shown. Very few vehicles implement Mode 08 over generic OBD-II; most actuator tests (fuel pump prime, EVAP seal, cooling fan, injector kill) live behind manufacturer UDS routines on a factory tool. Those routine IDs are proprietary and differ per model — send them here only if you already have the documented request.",
  },
  {
    title: "ECU coding & adaptation",
    status: "manual" as const,
    body: "Coding is UDS service 0x2E (write data by identifier) after a successful security unlock. The console can transmit those frames, but the identifiers, value formats and unlock algorithm are manufacturer secrets. There is no generic coding database — attempting guessed writes can brick a module.",
  },
  {
    title: "Key programming",
    status: "blocked" as const,
    body: "Immobiliser and key learning require the maker's seed/key algorithm, often a secure gateway unlock (FCA AutoAuth, VAG SFD, Mercedes DAS), and in many markets locksmith licensing. No browser tool can perform this legitimately — this is a dealer or licensed locksmith job.",
  },
  {
    title: "Security access (service 0x27)",
    status: "manual" as const,
    body: "You can request a seed with 27 01 and send a computed key with 27 02 from this console. Computing the key needs the vehicle-specific algorithm, which is not published and is not shipped with this app.",
  },
  {
    title: "J2534 pass-thru",
    status: "blocked" as const,
    body: "SAE J2534 is a Windows DLL API (PassThruConnect / PassThruWriteMsgs). Browsers cannot load native DLLs, so a pass-thru device such as a MongoosePro, Openport 2.0 or VCX Nano cannot be driven from a web page. Use the OEM Windows application for J2534 reflashing; this scanner covers ELM327-class diagnostics over USB and BLE.",
  },
];

const STATUS_STYLE = {
  partial: "border-warn/40 bg-warn/10 text-warn",
  manual: "border-info/40 bg-info/10 text-info",
  blocked: "border-danger/40 bg-danger/10 text-danger",
};

function ExpertPage() {
  const { sendRaw, state, logEntries } = useObd();
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const run = async (value: string) => {
    const c = value.trim();
    if (!c) return;
    if (state !== "connected") {
      toast.error("Connect an adapter first");
      return;
    }
    setBusy(true);
    try {
      await sendRaw(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Command failed");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }));
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Expert Console</h1>
        <p className="text-sm text-muted-foreground">
          Raw ELM327 AT commands and OBD / UDS service requests, with the full transaction log.
        </p>
      </header>

      <OfflineNotice />

      <div className="panel flex items-start gap-3 border-danger/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-muted-foreground">
          Anything typed here goes straight onto the vehicle bus. Writes to the wrong identifier can
          disable a control module permanently. Work with the engine off unless a procedure says
          otherwise, and keep a battery maintainer connected.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="panel p-4">
          <form
            className="no-print flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(cmd);
              setCmd("");
            }}
          >
            <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Terminal className="size-4 text-signal" />
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                placeholder="e.g. 010C, ATRV, 2210F1"
                className="readout h-10 flex-1 bg-transparent text-sm outline-none"
                spellCheck={false}
              />
            </div>
            <Button type="submit" disabled={busy}>
              <CornerDownLeft className="size-4" /> Send
            </Button>
          </form>

          <div
            ref={listRef}
            className="readout mt-3 h-[420px] overflow-auto rounded bg-background/60 p-3 text-xs"
          >
            {logEntries.length === 0 ? (
              <span className="text-muted-foreground">No traffic yet.</span>
            ) : (
              [...logEntries].reverse().map((e, i) => (
                <div key={i} className="whitespace-pre-wrap border-b border-border/40 py-1">
                  <span className={e.dir === "tx" ? "text-signal" : "text-muted-foreground"}>
                    {e.dir === "tx" ? "» " : "« "}
                  </span>
                  {e.text}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 text-sm font-semibold">Quick requests</h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.cmd}
                onClick={() => void run(p.cmd)}
                title={p.label}
                className="rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:border-signal/60"
              >
                <span className="readout text-signal">{p.cmd}</span>
                <span className="ml-2 text-muted-foreground">{p.label}</span>
                {p.note && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {p.note}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Advanced capabilities — what actually works in a browser
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {CAPABILITY.map((c) => (
            <article key={c.title} className="panel p-5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{c.title}</h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLE[c.status]}`}
                >
                  {c.status === "partial"
                    ? "Partly supported"
                    : c.status === "manual"
                      ? "Manual frames only"
                      : "Not possible in a browser"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

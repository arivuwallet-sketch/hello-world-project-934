import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Eraser, Printer, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { useObd } from "@/lib/obd/store";
import { DTC_DB_SIZE, SEVERITY_ORDER, isValidDtc, lookupDtc, type DtcInfo, type Severity } from "@/lib/obd/dtc";

export const Route = createFileRoute("/codes")({
  head: () => ({
    meta: [
      { title: "Fault Codes & DTC Lookup — TorqueDeck" },
      {
        name: "description",
        content:
          "Read stored, pending and permanent OBD-II trouble codes with plain-English meanings, likely causes and severity ratings.",
      },
      { property: "og:title", content: "Fault Codes & DTC Lookup — TorqueDeck" },
      {
        property: "og:description",
        content: "Stored, pending and permanent DTCs explained in plain English with likely causes.",
      },
    ],
  }),
  component: CodesPage,
});

const SEV_STYLE: Record<Severity, string> = {
  critical: "bg-danger/15 text-danger border-danger/40",
  serious: "bg-warn/15 text-warn border-warn/40",
  moderate: "bg-info/15 text-info border-info/40",
  minor: "bg-muted text-muted-foreground border-border",
  unknown: "bg-muted text-muted-foreground border-border",
};

function CodeCard({ info, tag }: { info: DtcInfo; tag: string }) {
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="readout text-xl font-bold text-signal">{info.code}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${SEV_STYLE[info.severity]}`}>
          {info.severity === "unknown" ? "severity unavailable" : `${info.severity} reference severity`}
        </span>
        <Badge variant="secondary">{info.system}</Badge>
        <Badge variant="outline">{tag}</Badge>
      </div>
      <h3 className="mt-2 text-base font-semibold">{info.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{info.meaning}</p>
      {info.definitionAvailable ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {info.repair.length > 0 && <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Likely causes
          </div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {info.causes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Repair steps
          </div>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {info.repair.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </div> : <p className="mt-3 text-xs text-warn">No diagnosis or repair step is inferred. Use verified service information for this VIN and module.</p>}
    </article>
  );
}

function CodesPage() {
  const { dtcs, pendingDtcs, permanentDtcs, scanDtcs, clearDtcs, state, milOn } = useObd();
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState(false);

  const groups = useMemo(() => {
    const all: { info: DtcInfo; tag: string }[] = [
      ...dtcs.map((c) => ({ info: lookupDtc(c), tag: "Stored" })),
      ...pendingDtcs.map((c) => ({ info: lookupDtc(c), tag: "Pending" })),
      ...permanentDtcs.map((c) => ({ info: lookupDtc(c), tag: "Permanent" })),
    ];
    return all.sort((a, b) => SEVERITY_ORDER[a.info.severity] - SEVERITY_ORDER[b.info.severity]);
  }, [dtcs, pendingDtcs, permanentDtcs]);

  const trimmedQuery = query.trim();
  const queryIsCode = isValidDtc(trimmedQuery);
  const lookupResult = queryIsCode ? lookupDtc(trimmedQuery) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fault Codes</h1>
          <p className="text-sm text-muted-foreground">
            Modes 03, 07 and 0A — stored, pending and permanent memory.
          </p>
        </div>
        <div className="no-print flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void scanDtcs()}>
            <Search className="size-4" /> Rescan
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Export
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (state !== "connected") {
                toast.error("Connect an adapter first");
                return;
              }
              setConfirm(true);
            }}
          >
            <Eraser className="size-4" /> Clear codes
          </Button>
        </div>
      </header>

      <OfflineNotice />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Stored", dtcs.length],
          ["Pending", pendingDtcs.length],
          ["Permanent", permanentDtcs.length],
        ].map(([label, n]) => (
          <div key={label as string} className="panel p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="readout text-2xl font-semibold">{n as number}</div>
          </div>
        ))}
        <div className="panel flex items-center gap-2 p-4">
          <ShieldAlert className={state === "connected" && milOn ? "size-6 text-danger" : "size-6 text-muted-foreground"} />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">MIL</div>
            <div className="font-display font-semibold">{state !== "connected" ? "—" : milOn ? "Illuminated" : "Off"}</div>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="panel p-6 text-sm text-muted-foreground">
          No trouble codes read from this ECU. If the warning light is on but nothing appears here,
          the fault may live in a non-emissions module (ABS, airbag, body) which generic OBD-II does
          not expose.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map(({ info, tag }) => (
            <CodeCard key={`${tag}-${info.code}`} info={info} tag={tag} />
          ))}
        </div>
      )}

      <section className="no-print panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-signal" /> Code dictionary
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {DTC_DB_SIZE} curated reference entries. Unknown and manufacturer-specific codes remain
          unidentified until checked against verified service information for the vehicle.
        </p>
        <Input
          className="mt-3 max-w-xs"
          placeholder="Look up a code, e.g. P0420"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {lookupResult ? (
          <div className="mt-4 max-w-2xl">
            <CodeCard info={lookupResult} tag="Lookup" />
          </div>
        ) : trimmedQuery.length >= 3 ? (
          <p className="mt-3 max-w-2xl text-sm text-warn">
            “{trimmedQuery}” is not a diagnostic trouble code, so there is nothing to look up. A real
            code is a letter P, B, C or U, then a digit 0-3, then three characters 0-9 or A-F — for
            example P0420, U0100 or C1234.
          </p>
        ) : null}
      </section>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear stored fault codes?</DialogTitle>
            <DialogDescription>
              This hides the symptom, it does not fix the cause. The code returns the moment the
              fault repeats, freeze frame data is lost, and readiness monitors reset — the vehicle
              can fail an emissions test until a full drive cycle completes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirm(false);
                void clearDtcs();
              }}
            >
              Yes, clear memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { FileLock2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { loadAudit, verifyAudit, type AuditEntry, type AuditIntegrity } from "@/lib/obd/audit";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Tamper-evident record of every sensitive action: operator, role, vehicle, VIN, ECU, calibration file, authorisation, result and errors.",
      },
      { property: "og:title", content: "Audit Log | Vehicle Insight Hub" },
      { property: "og:description", content: "Hash-chained entries — an edited record breaks the chain and is reported." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [integrity, setIntegrity] = useState<AuditIntegrity | null>(null);

  const refresh = useCallback(async () => {
    const records = loadAudit();
    setEntries(records);
    setIntegrity(await verifyAudit(records));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Every authorisation, clearing operation and programming attempt, chained so edits are detectable.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {integrity && (
            <Badge variant={integrity.state === "TAMPERED" ? "destructive" : "secondary"} className="readout text-[10px]">
              {integrity.state === "TAMPERED" ? `CHAIN BROKEN AT ${integrity.brokenAt}` : `CHAIN ${integrity.state}`}
            </Badge>
          )}
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className="size-4" /> Re-verify
          </button>
        </div>
      </header>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><FileLock2 className="size-4 text-signal" /> Recorded actions</h2>
        {entries.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">No sensitive actions recorded</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{entry.operation}</span>
                  <Badge
                    variant={entry.result === "SUCCESS" ? "secondary" : entry.result === "FAILED" ? "destructive" : "outline"}
                    className="readout text-[10px]"
                  >
                    {entry.result}
                  </Badge>
                  <span className="readout ml-auto text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div><dt className="text-muted-foreground">Operator</dt><dd className="readout">{entry.user}</dd></div>
                  <div><dt className="text-muted-foreground">Role</dt><dd className="readout">{entry.role}</dd></div>
                  <div><dt className="text-muted-foreground">Vehicle</dt><dd className="readout">{entry.vehicle ?? "UNAVAILABLE"}</dd></div>
                  <div><dt className="text-muted-foreground">VIN</dt><dd className="readout">{entry.vin ?? "UNAVAILABLE"}</dd></div>
                  <div><dt className="text-muted-foreground">ECU</dt><dd className="readout">{entry.ecu ?? "UNAVAILABLE"}</dd></div>
                  <div><dt className="text-muted-foreground">File</dt><dd className="readout">{entry.file ?? "UNAVAILABLE"}</dd></div>
                  <div><dt className="text-muted-foreground">Calibration</dt><dd className="readout">{entry.calibration ?? "UNAVAILABLE"}</dd></div>
                  <div><dt className="text-muted-foreground">Hardware</dt><dd className="readout">{entry.hardware ?? "UNAVAILABLE"}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Authorisation</dt><dd className="readout">{entry.authorization}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Record hash</dt><dd className="readout break-all">{entry.hash.slice(0, 32)}…</dd></div>
                </dl>
                {entry.errors.length > 0 && (
                  <ul className="readout mt-2 space-y-1 text-xs text-danger">
                    {entry.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

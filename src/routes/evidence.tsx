import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { loadDiagSessions, type DiagSession } from "@/lib/obd/diag-sessions";
import {
  PACKAGE_FILES,
  buildEvidencePackage,
  downloadEvidencePackage,
  type EvidencePackage,
  type PackageInput,
} from "@/lib/obd/evidence-package";
import { appendEvidence, loadEvidenceChain, verifyEvidenceChain, type EvidenceObject } from "@/lib/obd/evidence-chain";
import { loadMeasurements } from "@/lib/obd/measurements";
import { loadAudit } from "@/lib/obd/audit";
import { loadOperator } from "@/lib/obd/roles";
import { loadImportedCanDatasets, loadImportedObdDatasets } from "@/lib/obd/dataset-store";

export const Route = createFileRoute("/evidence")({
  head: () => ({
    meta: [
      { title: "Diagnostic Evidence Package | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Exports the real evidence a session holds as separate files with a SHA-256 manifest, and keeps a tamper-evident chain of every exported object.",
      },
      { property: "og:title", content: "Diagnostic Evidence Package | Vehicle Insight Hub" },
      { property: "og:description", content: "Files with no real source are listed as unavailable, never filled in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EvidencePage,
});

function EvidencePage() {
  const obd = useObd();
  const [sessions, setSessions] = useState<DiagSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [pkg, setPkg] = useState<EvidencePackage | null>(null);
  const [chain, setChain] = useState<EvidenceObject[]>([]);
  const [chainState, setChainState] = useState<string>("NOT VERIFIED");

  useEffect(() => {
    setSessions(loadDiagSessions());
    setChain(loadEvidenceChain());
    void verifyEvidenceChain().then((result) =>
      setChainState(result.brokenAt ? `${result.state} at ${result.brokenAt}` : result.state),
    );
  }, []);

  async function build() {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const json = (value: unknown) => JSON.stringify(value, null, 2);
    const measurements = loadMeasurements().filter((item) => item.sessionId === session.id);
    const audit = loadAudit();
    const input: PackageInput = {
      "session.json": json(session),
      "vehicle.json": session.vin ? json({ vin: session.vin, vehicleId: session.vehicleId }) : null,
      "ecu.json": session.ecus.length ? json(session.ecus) : null,
      "dtcs.json": session.dtcs.length ? json(session.dtcs) : null,
      "raw_obd.log": obd.logEntries.length
        ? obd.logEntries.map((entry) => `${new Date(entry.ts).toISOString()} ${entry.dir.toUpperCase()} ${entry.text}`).join("\n")
        : null,
      "measurements.json": measurements.length ? json(measurements) : null,
      "audit.json": audit.length ? json(audit) : null,
      "dataset_sources.json": (() => {
        const datasets = [...loadImportedObdDatasets(), ...loadImportedCanDatasets()];
        return datasets.length ? json(datasets.map((dataset) => dataset.provenance)) : null;
      })(),
      "readiness.json": obd.readiness ? json(obd.readiness) : null,
      "freeze_frames.json": obd.freeze ? json(obd.freeze) : null,
    };
    const created = await buildEvidencePackage(session.id, session.workOrderId || session.id, input);
    setPkg(created);
    const operator = loadOperator();
    await appendEvidence({
      kind: "EVIDENCE PACKAGE",
      sessionId: session.id,
      source: "Session evidence export",
      operator: operator.name || operator.role,
      operation: `Evidence package with ${created.files.length} files`,
      content: created.manifest,
    });
    setChain(loadEvidenceChain());
    const verified = await verifyEvidenceChain();
    setChainState(verified.brokenAt ? `${verified.state} at ${verified.brokenAt}` : verified.state);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Diagnostic evidence package</h1>
        <p className="text-sm text-muted-foreground">
          Exports what a session really contains. Each file carries its own checksum and the manifest hash covers the
          whole package.
        </p>
      </header>

      <section className="panel space-y-3 p-5">
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">Select a recorded session</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.workOrderId || session.id.slice(0, 8)} · {new Date(session.startedAt).toLocaleString()}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!sessionId} onClick={() => void build()}>
            Build evidence package
          </Button>
          <Button variant="secondary" disabled={!pkg} onClick={() => pkg && downloadEvidencePackage(pkg)}>
            <Download className="size-4" /> Download files
          </Button>
        </div>
        {sessions.length === 0 && (
          <p className="readout text-xs text-muted-foreground">
            NO SESSIONS RECORDED — OPEN A DIAGNOSTIC SESSION FIRST
          </p>
        )}
      </section>

      {pkg && (
        <section className="panel p-5">
          <h2 className="font-semibold">Package</h2>
          <p className="readout mt-2 text-xs text-muted-foreground">
            EVIDENCE PACKAGE CREATED · FILES: {pkg.files.length} · SHA-256: {pkg.manifestHash}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {pkg.files.map((file) => (
              <li key={file.name} className="flex flex-wrap items-baseline gap-2 border-b border-border/60 py-1">
                <span className="readout w-52">{file.name}</span>
                <span className="text-xs text-muted-foreground">{file.content.length} bytes</span>
                <span className="readout ml-auto text-xs text-muted-foreground">{file.checksum.slice(0, 24)}…</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Not included — no real source
          </h3>
          <ul className="readout mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {pkg.omitted.map((item) => (
              <li key={item.name}>
                {item.name}: {item.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-signal" /> Evidence chain
        </h2>
        <p className="readout mt-2 text-xs text-muted-foreground">CHAIN STATE: {chainState}</p>
        {chain.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">NO EVIDENCE OBJECTS RECORDED</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {chain.slice(0, 40).map((entry) => (
              <li key={entry.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="readout text-[10px]">{entry.kind}</Badge>
                  <span>{entry.operation}</span>
                  {entry.supersededBy && (
                    <Badge variant="secondary" className="readout text-[10px]">SUPERSEDED</Badge>
                  )}
                </div>
                <p className="readout mt-1 text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString()} · {entry.operator} · session{" "}
                  {entry.sessionId?.slice(0, 8) ?? "—"} · content {entry.contentHash.slice(0, 16)}… · link{" "}
                  {entry.hash.slice(0, 16)}…
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {PACKAGE_FILES.length} package file slots are defined. Historical evidence is never overwritten — a changed
          object is reported as EVIDENCE MODIFIED and a replacement is linked instead.
        </p>
      </section>
    </div>
  );
}

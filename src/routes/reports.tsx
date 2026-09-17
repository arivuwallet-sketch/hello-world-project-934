import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";
import { buildReport } from "@/lib/obd/report";
import { assessHealth } from "@/lib/obd/analysis";
import { loadPerformanceSessions, type PerformanceSession } from "@/lib/obd/performance";
import { loadServiceRecords, type ServiceRecord } from "@/lib/obd/service";
import { loadProjects, type TuningProject } from "@/lib/obd/tuning/projects";
import { BUILT_IN_SOURCES } from "@/lib/obd/sources";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";
import { createSignedReport, customerData, type ReportDatum, type SignedReport } from "@/lib/obd/report-modes";
import { loadAudit } from "@/lib/obd/audit";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Diagnostic Reports | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Generate a professional diagnostic report covering codes, freeze frame, readiness, live data, tuning, performance and source provenance.",
      },
      { property: "og:title", content: "Diagnostic Reports | Vehicle Insight Hub" },
      { property: "og:description", content: "Fields without a real source are printed as UNAVAILABLE, never filled in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const obd = useObd();
  const [technician, setTechnician] = useState("");
  const [performance, setPerformance] = useState<PerformanceSession[]>([]);
  const [serviceHistory, setServiceHistory] = useState<ServiceRecord[]>([]);
  const [projects, setProjects] = useState<TuningProject[]>([]);
  const [mode, setMode] = useState<"CUSTOMER" | "ENGINEERING">("CUSTOMER");
  const [signed, setSigned] = useState<SignedReport | null>(null);

  useEffect(() => {
    setPerformance(loadPerformanceSessions());
    setServiceHistory(loadServiceRecords());
    setProjects(loadProjects());
  }, []);

  const vehicle = obd.vehicles.find((entry) => entry.id === obd.activeVehicleId) ?? null;

  const report = useMemo(() => {
    const liveSignals = (Object.keys(obd.signalDetails) as PidId[]).flatMap((pid) => {
      const detail = obd.signalDetails[pid];
      if (!detail) return [];
      return [
        {
          label: PID_BY_ID[pid]?.label ?? pid,
          value: `${detail.value} ${detail.unit}`,
          source: `${detail.ecu ?? "ECU —"} · PID ${detail.pid} · ${detail.sourceName}`,
        },
      ];
    });
    return buildReport({
      technician,
      vehicleLabel: vehicle ? `${vehicle.nickname || vehicle.make} ${vehicle.model} ${vehicle.year}`.trim() : "",
      vin: obd.vin,
      adapter: obd.adapterName,
      protocol: obd.protocolName,
      connected: obd.state === "connected",
      storedDtcs: obd.dtcs,
      pendingDtcs: obd.pendingDtcs,
      permanentDtcs: obd.permanentDtcs,
      readiness: obd.readiness
        ? [...obd.readiness.continuous, ...obd.readiness.nonContinuous].map((monitor) => ({
            name: monitor.name,
            supported: monitor.supported,
            complete: monitor.complete,
          }))
        : [],
      freeze: obd.freeze?.values ?? [],
      liveSignals,
      evSignals: [],
      obfcm: [],
      tuning: projects[0] ?? null,
      performance,
      serviceHistory,
      health: assessHealth({
        connected: obd.state === "connected",
        storedDtcs: obd.dtcs,
        pendingDtcs: obd.pendingDtcs,
        milOn: obd.milOn,
        readinessSupported: Boolean(obd.readiness),
        readinessIncomplete: [],
        coolantC: obd.live.coolant ?? null,
        voltage: obd.live.voltage ?? null,
      }),
      dataSources: BUILT_IN_SOURCES.map(({ provenance }) => ({
        label: provenance.sourceName,
        value: `${provenance.classification} · ${provenance.license} · imported ${new Date(provenance.importedAt).toLocaleDateString()}`,
      })),
    });
  }, [obd, technician, vehicle, projects, performance, serviceHistory]);

  const reportData: ReportDatum[] = useMemo(() => {
    const live = (Object.keys(obd.signalDetails) as PidId[]).flatMap((id) => {
      const d = obd.signalDetails[id];
      if (!d) return [];
      return [{ label: PID_BY_ID[id]?.label ?? id, value: `${d.value} ${d.unit}`, origin: "ECU REPORTED" as const, source: `${d.sourceName} · PID ${d.pid} · ECU ${d.ecu ?? "UNAVAILABLE"}`, timestamp: d.timestamp, raw: d.rawResponse }];
    });
    return [
      ...obd.dtcs.map((code) => ({ label: "Stored DTC", value: code, origin: "ECU REPORTED" as const, source: "Mode 03" })),
      ...obd.pendingDtcs.map((code) => ({ label: "Pending DTC", value: code, origin: "ECU REPORTED" as const, source: "Mode 07" })),
      ...live,
      ...serviceHistory.map((record) => ({ label: "Service record", value: `${record.date} — ${record.service}`, origin: "USER ENTERED" as const, source: record.technician || "User" })),
      ...loadAudit().map((entry) => ({ label: `Audit: ${entry.operation}`, value: entry.result, origin: "HISTORICAL" as const, source: entry.hash, timestamp: Date.parse(entry.timestamp) })),
    ];
  }, [obd.signalDetails, obd.dtcs, obd.pendingDtcs, serviceHistory]);

  const seal = async () => {
    const data = mode === "CUSTOMER" ? customerData(reportData) : reportData;
    setSigned(await createSignedReport({ mode, softwareVersion: "Vehicle Insight Hub 1.0", vehicle: report.vehicleLabel, vin: report.vin, technician, data, datasetVersions: report.provenance.map((p) => `${p.label}: ${p.value}`), hardware: obd.adapterName || "UNAVAILABLE", limitations: report.limitations }, technician));
  };

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Diagnostic Reports</h1>
          <p className="text-sm text-muted-foreground">
            Built from what this session actually read. Anything without a real source prints as UNAVAILABLE.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant={mode === "CUSTOMER" ? "default" : "outline"} onClick={() => { setMode("CUSTOMER"); setSigned(null); }}>Customer</Button>
            <Button size="sm" variant={mode === "ENGINEERING" ? "default" : "outline"} onClick={() => { setMode("ENGINEERING"); setSigned(null); }}>Engineering</Button>
          </div>
          <label className="text-xs text-muted-foreground">
            Technician
            <input
              value={technician}
              onChange={(event) => setTechnician(event.target.value)}
              className="mt-1 block rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          <Button variant="outline" onClick={() => void seal()}><ShieldCheck className="size-4" /> Hash & sign</Button>
          <Button onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
        </div>
      </header>

      <article className="panel p-6">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-signal" />
          <div>
            <h2 className="font-semibold">{mode === "CUSTOMER" ? "Customer report" : "Engineering report"}</h2>
            <p className="text-xs text-muted-foreground">
              Generated {new Date(report.generatedAt).toLocaleString()} · technician {report.technician || "UNAVAILABLE"}
            </p>
          </div>
        </div>

        {signed && <div className="readout mt-4 rounded-md border border-signal/40 p-3 text-xs"><Badge className="mr-2">SEALED</Badge>REPORT HASH {signed.hash}<br/>SIGNATURE {signed.signature ?? "NOT SIGNED — technician name unavailable"}</div>}

        {mode === "CUSTOMER" && <p className="mt-4 rounded-md border border-border p-3 text-sm text-muted-foreground">Owner view: faults, status, warnings, next steps and service information. Raw hexadecimal is hidden. Switch to Engineering for raw evidence and provenance.</p>}

        {report.warnings.length > 0 && (
          <ul className="readout mt-5 space-y-1 rounded-md border border-warn/40 p-3 text-xs text-warn">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-6">
          {report.sections.filter((section) => mode === "ENGINEERING" || !["Tuning", "OBFCM"].includes(section.title)).map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h3>
              {section.unavailable ? (
                <p className="readout mt-2 text-sm text-muted-foreground">{section.unavailable}</p>
              ) : (
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {section.rows.map((row, index) => (
                    <div key={`${row.label}-${index}`} className="flex justify-between gap-3 border-b border-border/50 py-1">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="readout text-right">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Source provenance</h3>
            <dl className="mt-2 space-y-1 text-sm">
              {report.provenance.map((entry) => (
                <div key={entry.label} className="flex justify-between gap-3 border-b border-border/50 py-1">
                  <dt className="text-muted-foreground">{entry.label}</dt>
                  <dd className="readout text-right">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {mode === "ENGINEERING" && <section><h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Engineering evidence</h3><dl className="mt-2 space-y-1 text-sm">{reportData.map((entry, index) => <div key={`${entry.label}-${index}`} className="grid gap-2 border-b border-border/50 py-1 sm:grid-cols-[160px_1fr_140px]"><dt className="text-muted-foreground">{entry.label}</dt><dd className="readout break-all">{entry.value}{entry.raw ? ` · raw ${entry.raw}` : ""}</dd><dd><Badge variant="secondary" className="readout text-[10px]">{entry.origin}</Badge></dd></div>)}</dl></section>}

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Limitations</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {report.limitations.map((limitation) => (
                <li key={limitation}>• {limitation}</li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}

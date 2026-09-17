import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Cpu, FileWarning, GitBranch, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";
import {
  IDENTIFICATION_DIDS,
  decodeDidResponse,
  type EcuIdentification,
  type IdentificationField,
} from "@/lib/obd/tuning/identification";
import {
  diffCalibrations,
  importCalibrationFile,
  type CalibrationDiff,
  type CalibrationFile,
} from "@/lib/obd/tuning/calibration";
import { findChecksumAlgorithm, verifyChecksums } from "@/lib/obd/tuning/checksum";
import { validateCalibration, type ValidationReport } from "@/lib/obd/tuning/validation";
import { runPreflight, type PreflightResult } from "@/lib/obd/tuning/programming";
import {
  appendLog,
  attachOriginal,
  attachRevision,
  createProject,
  loadProjects,
  saveProjects,
  type TuningProject,
} from "@/lib/obd/tuning/projects";

export const Route = createFileRoute("/tuning")({
  head: () => ({
    meta: [
      { title: "ECU Tuning | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "ECU identification, calibration versioning, byte-exact diffing, checksum verification and safety-gated programming pre-flight with real hardware only.",
      },
      { property: "og:title", content: "ECU Tuning | Vehicle Insight Hub" },
      { property: "og:description", content: "Original backups, validated calibrations and programming that never fakes success." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TuningPage,
});

const FIELD_LABELS: Record<IdentificationField, string> = {
  vin: "VIN",
  ecuManufacturer: "ECU manufacturer",
  ecuFamily: "ECU family",
  ecuHardwareNumber: "Hardware number",
  ecuSoftwareNumber: "Software number",
  calibrationId: "Calibration ID",
  bootSoftware: "Bootloader software",
};

function hexBytes(response: string): number[] {
  return (
    response
      .replace(/SEARCHING\.\.\.|>|\r/gi, " ")
      .match(/\b[0-9A-F]{2}\b/gi)
      ?.map((token) => Number.parseInt(token, 16)) ?? []
  );
}

function TuningPage() {
  const { state, sendRaw, protocolName, adapterName, vin, activeVehicleId, vehicles, live, dtcs } = useObd();
  const [projects, setProjects] = useState<TuningProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bytes, setBytes] = useState<{ original: Uint8Array | null; modified: Uint8Array | null }>({ original: null, modified: null });
  const [technician, setTechnician] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loaded = loadProjects();
    setProjects(loaded);
    setActiveId(loaded[0]?.id ?? null);
  }, []);

  const project = projects.find((entry) => entry.id === activeId) ?? null;

  const persist = (next: TuningProject[]) => {
    setProjects(next);
    saveProjects(next);
  };

  const update = (updated: TuningProject) => persist(projects.map((entry) => (entry.id === updated.id ? updated : entry)));

  const vehicleLabel = useMemo(() => {
    const vehicle = vehicles.find((entry) => entry.id === activeVehicleId);
    return vehicle ? `${vehicle.nickname || vehicle.make} ${vehicle.model}`.trim() : "";
  }, [vehicles, activeVehicleId]);

  const newProject = () => {
    const created = createProject({ vehicleId: activeVehicleId, vehicleLabel, vin, technician, notes: "" });
    persist([created, ...projects]);
    setActiveId(created.id);
  };

  /** Reads identification DIDs from the ECU. Missing fields stay missing. */
  const identify = async () => {
    if (!project) return;
    if (state !== "connected") {
      toast.error("OBD ADAPTER NOT CONNECTED");
      return;
    }
    setBusy(true);
    const fields: Partial<Record<IdentificationField, string>> = {};
    for (const [field, did] of Object.entries(IDENTIFICATION_DIDS) as [IdentificationField, number][]) {
      try {
        const raw = await sendRaw(`22${did.toString(16).toUpperCase().padStart(4, "0")}`);
        fields[field] = decodeDidResponse(hexBytes(raw), did);
      } catch {
        // Not readable from this ECU — deliberately left out.
      }
    }
    setBusy(false);
    if (Object.keys(fields).length === 0) {
      toast.error("ECU NOT RESPONDING to identification requests");
      update(appendLog(project, "ECU", "Identification failed — no DID answered"));
      return;
    }
    const identification: EcuIdentification = {
      ecuAddress: adapterName || "unknown",
      protocol: protocolName || "PROTOCOL DETECTION FAILED",
      fields,
      supportedServices: [0x22],
      programmingCapability: "UNKNOWN",
      memoryInfo: null,
      readAt: Date.now(),
    };
    update(
      appendLog(
        { ...project, identification, status: project.status === "NEW" ? "IDENTIFIED" : project.status },
        "ECU",
        `Identification read: ${Object.keys(fields).join(", ")}`,
      ),
    );
  };

  const loadFile = async (file: File | undefined, role: "ORIGINAL" | "MODIFIED") => {
    if (!file || !project) return;
    try {
      const imported = await importCalibrationFile(file, {
        role,
        ecu: project.identification?.fields.ecuManufacturer ?? null,
        hardwareNumber: project.identification?.fields.ecuHardwareNumber ?? null,
        softwareNumber: project.identification?.fields.ecuSoftwareNumber ?? null,
        calibrationId: project.identification?.fields.calibrationId ?? null,
        vin: project.vin,
        version: role === "ORIGINAL" ? "baseline" : `rev-${project.revisions.length + 1}`,
        branch: "main",
        revision: role === "ORIGINAL" ? 0 : project.revisions.length + 1,
        technician: technician || project.technician,
        notes: "",
      });
      setBytes((current) => ({ ...current, [role === "ORIGINAL" ? "original" : "modified"]: imported.bytes }));
      update(role === "ORIGINAL" ? attachOriginal(project, imported.file) : attachRevision(project, imported.file));
      toast.success(`${role} calibration stored (${imported.file.hash.slice(0, 12)}…)`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const diff: CalibrationDiff | null = useMemo(
    () => (bytes.original && bytes.modified ? diffCalibrations(bytes.original, bytes.modified) : null),
    [bytes],
  );

  const checksums = useMemo(() => {
    if (!bytes.modified) return [];
    return verifyChecksums(bytes.modified, findChecksumAlgorithm(project?.identification?.fields.ecuFamily ?? null));
  }, [bytes.modified, project]);

  const validation: ValidationReport | null = useMemo(() => {
    if (!project?.modified) return null;
    return validateCalibration({
      candidate: project.modified,
      original: project.original,
      identification: project.identification,
      checksums,
      mapDefinitionsAvailable: false,
    });
  }, [project, checksums]);

  const preflight: PreflightResult | null = useMemo(() => {
    if (!project) return null;
    return runPreflight({
      ecuIdentified: Boolean(project.identification),
      hardwareSupportsProgramming: null,
      protocolConfirmed: Boolean(protocolName),
      connectionStable: state === "connected",
      measuredVoltage: live.voltage ?? null,
      calibrationSelected: Boolean(project.modified),
      originalBackupVerified: project.original?.backupVerified ?? false,
      validationStatus: validation?.status ?? null,
      authorizationGranted: false,
    });
  }, [project, protocolName, state, live.voltage, validation]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ECU Tuning</h1>
          <p className="text-sm text-muted-foreground">
            Identification, calibration versioning, byte-exact diffing, checksum verification and programming pre-flight.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Technician
            <input
              value={technician}
              onChange={(event) => setTechnician(event.target.value)}
              className="mt-1 block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Name"
            />
          </label>
          <button onClick={newProject} className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-background">
            New project
          </button>
        </div>
      </header>

      <div className="panel flex items-start gap-3 border-danger/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-muted-foreground">
          Writing to an ECU requires an authorised programming interface. This build performs identification, validation
          and pre-flight only; flashing stays blocked and reports UNSUPPORTED BY ADAPTER until such an interface is
          connected. Passing validation never means a calibration is safe.
        </p>
      </div>

      {projects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {projects.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setActiveId(entry.id)}
              className={`readout rounded-md border px-3 py-1.5 text-xs ${entry.id === activeId ? "border-signal text-signal" : "border-border text-muted-foreground"}`}
            >
              {entry.vehicleLabel || "Unlabelled"} · {entry.status}
            </button>
          ))}
        </div>
      )}

      {!project ? (
        <p className="panel readout p-5 text-sm text-muted-foreground">No tuning project — create one to begin.</p>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="panel p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold"><Cpu className="size-4 text-signal" /> ECU identification</h2>
                <button
                  onClick={() => void identify()}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {busy ? "Reading…" : "Read from ECU"}
                </button>
              </div>
              <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2 text-sm">
                {(Object.keys(FIELD_LABELS) as IdentificationField[]).map((field) => (
                  <div key={field} className="contents">
                    <dt className="text-muted-foreground">{FIELD_LABELS[field]}</dt>
                    <dd className="readout break-all">{project.identification?.fields[field] ?? "UNAVAILABLE"}</dd>
                  </div>
                ))}
                <dt className="text-muted-foreground">Protocol</dt>
                <dd className="readout">{project.identification?.protocol ?? "UNAVAILABLE"}</dd>
                <dt className="text-muted-foreground">Programming capability</dt>
                <dd className="readout">{project.identification?.programmingCapability ?? "UNKNOWN"}</dd>
                <dt className="text-muted-foreground">Memory information</dt>
                <dd className="readout">{project.identification?.memoryInfo ?? "UNAVAILABLE"}</dd>
              </dl>
            </article>

            <article className="panel p-5">
              <h2 className="flex items-center gap-2 font-semibold"><Upload className="size-4" /> Calibration files</h2>
              <div className="mt-4 space-y-4 text-sm">
                <FileSlot title="Original backup" file={project.original} onPick={(file) => void loadFile(file, "ORIGINAL")} locked={Boolean(project.original)} />
                <FileSlot title="Modified calibration" file={project.modified} onPick={(file) => void loadFile(file, "MODIFIED")} locked={false} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                BACKUP VERIFIED is only shown after a read-back comparison against the ECU. The original baseline can
                never be overwritten.
              </p>
            </article>
          </section>

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold"><GitBranch className="size-4" /> Revisions</h2>
            {project.revisions.length === 0 ? (
              <p className="readout mt-3 text-sm text-muted-foreground">No revisions stored</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {project.revisions.map((revision) => (
                  <li key={revision.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                    <span className="readout">{revision.version} · r{revision.revision} · {revision.branch}</span>
                    <span className="text-muted-foreground">{revision.filename}</span>
                    <span className="readout text-xs text-muted-foreground">{revision.hash.slice(0, 16)}…</span>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(revision.timestamp).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="panel p-5">
              <h2 className="font-semibold">Calibration diff</h2>
              {!diff ? (
                <p className="readout mt-3 text-sm text-muted-foreground">
                  Load both the original and modified binaries in this session to compare bytes.
                </p>
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-muted-foreground">Changed bytes</dt><dd className="readout">{diff.changedByteCount}</dd></div>
                    <div><dt className="text-muted-foreground">Unchanged bytes</dt><dd className="readout">{diff.unchangedByteCount}</dd></div>
                    <div><dt className="text-muted-foreground">Changed regions</dt><dd className="readout">{diff.ranges.length}</dd></div>
                    <div><dt className="text-muted-foreground">Size mismatch</dt><dd className="readout">{diff.sizeMismatch ? "YES" : "NO"}</dd></div>
                  </dl>
                  <ul className="readout mt-3 max-h-48 space-y-1 overflow-auto text-xs">
                    {diff.ranges.slice(0, 60).map((range) => (
                      <li key={range.offset}>
                        0x{range.offset.toString(16).padStart(6, "0")} · {range.length} B ·{" "}
                        {range.originalBytes.slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join(" ")} →{" "}
                        {range.modifiedBytes.slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join(" ")}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>

            <article className="panel p-5">
              <h2 className="font-semibold">Validation & checksums</h2>
              {!validation ? (
                <p className="readout mt-3 text-sm text-muted-foreground">No modified calibration to validate</p>
              ) : (
                <>
                  <Badge variant={validation.status === "VALID" ? "secondary" : "destructive"} className="readout mt-3 text-[10px]">
                    {validation.status}
                  </Badge>
                  <ul className="mt-3 space-y-2 text-sm">
                    {validation.checks.map((check) => (
                      <li key={check.name} className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">{check.name}</span>
                        <span className="readout text-right text-xs">
                          {check.status}
                          <span className="block text-[10px] text-muted-foreground">{check.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          </section>

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 font-semibold"><FileWarning className="size-4 text-warn" /> Programming pre-flight</h2>
            {preflight && (
              <>
                <Badge variant={preflight.blocked ? "destructive" : "secondary"} className="readout mt-3 text-[10px]">
                  {preflight.blocked ? "PROGRAMMING BLOCKED" : "PRE-FLIGHT PASSED"}
                </Badge>
                <ul className="mt-3 space-y-2 text-sm">
                  {preflight.checks.map((check) => (
                    <li key={check.name} className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">{check.name}</span>
                      <span className="readout text-right text-xs">
                        {check.passed ? "OK" : "BLOCKED"}
                        <span className="block text-[10px] text-muted-foreground">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-muted-foreground">
                  State machine: IDLE → CONNECTING → IDENTIFYING → AUTHENTICATING → PREPARING → READING → VALIDATING →
                  ERASING → PROGRAMMING → VERIFYING → FINALIZING → RECONNECTING → COMPLETE. Progress only advances on
                  confirmed ECU responses; there is no timed progress bar.
                </p>
              </>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">Tuning log</h2>
            <p className="text-xs text-muted-foreground">
              Live evidence attached to this project: {dtcs.length} stored code(s) at last scan, module voltage{" "}
              {live.voltage == null ? "UNAVAILABLE" : `${live.voltage.toFixed(2)} V`}.
            </p>
            {project.logs.length === 0 ? (
              <p className="readout mt-3 text-sm text-muted-foreground">No log entries</p>
            ) : (
              <ul className="readout mt-3 max-h-64 space-y-1 overflow-auto text-xs">
                {project.logs.map((entry) => (
                  <li key={entry.id}>
                    {new Date(entry.timestamp).toLocaleTimeString()} · {entry.kind} · {entry.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FileSlot({
  title,
  file,
  onPick,
  locked,
}: {
  title: string;
  file: CalibrationFile | null;
  onPick: (file: File | undefined) => void;
  locked: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        {file && (
          <Badge variant="secondary" className="readout text-[10px]">
            {file.backupVerified ? "BACKUP VERIFIED" : "VERIFICATION PENDING"}
          </Badge>
        )}
      </div>
      {file ? (
        <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">File</dt><dd className="readout break-all">{file.filename}</dd>
          <dt className="text-muted-foreground">SHA-256</dt><dd className="readout break-all">{file.hash}</dd>
          <dt className="text-muted-foreground">Size</dt><dd className="readout">{file.size} bytes</dd>
          <dt className="text-muted-foreground">Stored</dt><dd className="readout">{new Date(file.timestamp).toLocaleString()}</dd>
        </dl>
      ) : (
        <p className="readout mt-2 text-xs text-muted-foreground">No file stored</p>
      )}
      {!locked && (
        <input type="file" className="mt-2 text-xs" onChange={(event) => onPick(event.target.files?.[0])} />
      )}
    </div>
  );
}

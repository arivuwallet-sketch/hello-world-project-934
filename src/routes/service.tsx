import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useObd } from "@/lib/obd/store";
import {
  createServiceRecord,
  loadServiceRecords,
  saveServiceRecords,
  type ServiceRecord,
} from "@/lib/obd/service";

export const Route = createFileRoute("/service")({
  head: () => ({
    meta: [
      { title: "Service History | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Record real workshop history: service, date, mileage, technician, parts, ECU work, calibration version, findings and fault codes.",
      },
      { property: "og:title", content: "Service History | Vehicle Insight Hub" },
      { property: "og:description", content: "Every entry is technician-recorded — nothing is generated." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicePage,
});

const EMPTY = {
  service: "",
  date: "",
  mileageKm: "",
  technician: "",
  parts: "",
  ecuWork: "",
  calibrationVersion: "",
  findings: "",
  notes: "",
};

function ServicePage() {
  const { activeVehicleId, dtcs } = useObd();
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [draft, setDraft] = useState(EMPTY);

  useEffect(() => setRecords(loadServiceRecords()), []);

  const add = () => {
    if (!draft.service.trim() || !draft.date) return;
    const record = createServiceRecord({
      vehicleId: activeVehicleId,
      service: draft.service.trim(),
      date: draft.date,
      mileageKm: draft.mileageKm ? Number(draft.mileageKm) : null,
      technician: draft.technician,
      parts: draft.parts,
      ecuWork: draft.ecuWork,
      calibrationVersion: draft.calibrationVersion,
      findings: draft.findings,
      dtcs,
      notes: draft.notes,
    });
    const next = [record, ...records];
    setRecords(next);
    saveServiceRecords(next);
    setDraft(EMPTY);
  };

  const field = (key: keyof typeof EMPTY, label: string, type = "text") => (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        type={type}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Service History</h1>
        <p className="text-sm text-muted-foreground">
          Workshop records you enter, filed against the selected vehicle and the codes present at the time.
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><ClipboardList className="size-4 text-signal" /> New record</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {field("service", "Service")}
          {field("date", "Date", "date")}
          {field("mileageKm", "Mileage (km)")}
          {field("technician", "Technician")}
          {field("parts", "Parts")}
          {field("ecuWork", "ECU work")}
          {field("calibrationVersion", "Calibration version")}
          {field("findings", "Diagnostic findings")}
          {field("notes", "Notes")}
        </div>
        <button onClick={add} className="mt-4 rounded-md bg-signal px-4 py-2 text-sm font-medium text-background">
          Save record
        </button>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Recorded history</h2>
        {records.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">No service records entered</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {records.map((record) => (
              <li key={record.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{record.service}</span>
                  <span className="readout text-xs text-muted-foreground">{record.date}</span>
                  <span className="readout ml-auto text-xs">{record.mileageKm ?? "—"} km</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Technician</dt><dd className="readout">{record.technician || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Parts</dt><dd className="readout">{record.parts || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">ECU work</dt><dd className="readout">{record.ecuWork || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Calibration</dt><dd className="readout">{record.calibrationVersion || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Findings</dt><dd className="readout">{record.findings || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Codes at service</dt><dd className="readout">{record.dtcs.join(", ") || "—"}</dd></div>
                </dl>
                {record.notes && <p className="mt-2 text-xs text-muted-foreground">{record.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

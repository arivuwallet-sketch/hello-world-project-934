/**
 * Client-side session exports.
 *
 * Everything written here comes from data already captured off the vehicle —
 * fault codes read with Mode 03/07, live samples recorded during the session
 * and readiness monitors from Mode 01 PID 01. Nothing is inferred or invented.
 */
import { jsPDF } from "jspdf";
import { lookupDtc } from "./dtc";
import { PID_BY_ID, type PidId } from "./pids";
import type { SessionRecord } from "./store";

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function download(name: string, mime: string, data: BlobPart) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "session";
}

/** CSV with the session header, every fault code and every recorded live sample. */
export function exportSessionCsv(s: SessionRecord) {
  const rows: (string | number | null)[][] = [
    ["Section", "Field", "Value", "Unit", "Timestamp"],
    ["Session", "Vehicle", s.vehicleLabel, "", fmt(s.startedAt)],
    ["Session", "VIN", s.vin ?? "", "", ""],
    ["Session", "Protocol", s.protocol, "", ""],
    ["Session", "Adapter", s.adapter, "", ""],
    ["Session", "Ended", fmt(s.endedAt), "", ""],
    ["Session", "Samples", s.samples, "", ""],
    ["Session", "Notes", s.notes, "", ""],
  ];

  for (const code of s.dtcs) rows.push(["Stored code", code, lookupDtc(code).title, "", ""]);
  for (const code of s.pending) rows.push(["Pending code", code, lookupDtc(code).title, "", ""]);

  for (const m of s.readiness ?? []) {
    rows.push(["Readiness", m.name, m.supported ? (m.complete ? "Complete" : "Not ready") : "Not supported", "", ""]);
  }

  for (const [id, v] of Object.entries(s.maxima)) {
    const def = PID_BY_ID[id as PidId];
    if (!def || v == null) continue;
    rows.push(["Peak", def.label, Math.round(v * 100) / 100, def.unit, ""]);
  }

  for (const [id, samples] of Object.entries(s.log ?? {})) {
    const def = PID_BY_ID[id as PidId];
    if (!def || !samples) continue;
    for (const sample of samples) {
      rows.push(["Sample", def.label, Math.round(sample.v * 100) / 100, def.unit, new Date(sample.t).toISOString()]);
    }
  }

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  download(`${slug(s.vehicleLabel)}-${s.startedAt}.csv`, "text/csv;charset=utf-8", csv);
}

/** Multi-page shop-style PDF report generated from the saved session. */
export function exportSessionPdf(s: SessionRecord, technician = "") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageH = doc.internal.pageSize.getHeight();
  const left = 48;
  let y = 56;

  const page = (needed = 16) => {
    if (y + needed > pageH - 48) {
      doc.addPage();
      y = 56;
    }
  };
  const heading = (text: string) => {
    page(30);
    y += 10;
    doc.setFont("helvetica", "bold").setFontSize(12).text(text, left, y);
    y += 6;
    doc.setLineWidth(0.5).line(left, y, 547, y);
    y += 14;
  };
  const line = (text: string, bold = false) => {
    const wrapped = doc.splitTextToSize(text, 499) as string[];
    for (const w of wrapped) {
      page();
      doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(10).text(w, left, y);
      y += 14;
    }
  };

  doc.setFont("helvetica", "bold").setFontSize(18).text("Vehicle Diagnostic Report", left, y);
  y += 20;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("TorqueDeck — standards-based OBD-II scan", left, y);
  y += 16;

  heading("Vehicle & session");
  line(`Vehicle: ${s.vehicleLabel}`);
  line(`VIN: ${s.vin ?? "not read"}`);
  line(`Scanned: ${fmt(s.startedAt)} — ${fmt(s.endedAt)}`);
  line(`Protocol: ${s.protocol}   Adapter: ${s.adapter}`);
  line(`Live samples recorded: ${s.samples}`);
  if (technician.trim()) line(`Technician: ${technician.trim()}`);
  if (s.notes.trim()) line(`Notes: ${s.notes.trim()}`);

  heading("Fault codes");
  if (s.dtcs.length + s.pending.length === 0) {
    line("No stored or pending codes were reported by the vehicle.");
  } else {
    for (const code of s.dtcs) {
      const info = lookupDtc(code);
      line(`${code} (stored) — ${info.title}`, true);
      line(`Severity: ${info.severity}`);
      if (info.causes.length) line(`Likely causes: ${info.causes.join("; ")}`);
      y += 4;
    }
    for (const code of s.pending) {
      const info = lookupDtc(code);
      line(`${code} (pending) — ${info.title}`, true);
      line(`Severity: ${info.severity}`);
      y += 4;
    }
  }

  if (s.freeze && s.freeze.length) {
    heading("Freeze frame");
    for (const f of s.freeze) line(`${f.label}: ${f.value}`);
  }

  if (s.readiness && s.readiness.length) {
    heading("Readiness monitors");
    for (const m of s.readiness) {
      line(`${m.name}: ${m.supported ? (m.complete ? "Complete" : "Not ready") : "Not supported"}`);
    }
  }

  const peaks = Object.entries(s.maxima).filter(([id, v]) => PID_BY_ID[id as PidId] && v != null);
  if (peaks.length) {
    heading("Peak live values");
    for (const [id, v] of peaks) {
      const def = PID_BY_ID[id as PidId]!;
      line(`${def.label}: ${Math.round((v as number) * 10) / 10} ${def.unit}`);
    }
  }

  heading("Scope");
  line(
    "This report covers generic SAE J1979 OBD-II data read through the connected adapter. " +
      "Codes without a stored definition are shown as unavailable rather than guessed. " +
      "Manufacturer-specific modules and routines are outside the scope of a generic OBD interface.",
  );

  doc.save(`${slug(s.vehicleLabel)}-${s.startedAt}.pdf`);
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useObd } from "@/lib/obd/store";
import { appendAudit } from "@/lib/obd/audit";
import { loadOperator, permissionState } from "@/lib/obd/roles";
import { definitionApplies, importServiceDefinitions, loadServiceDefinitions, validateServiceResponse, type ServiceDefinition } from "@/lib/obd/service-functions/definitions";

export const Route = createFileRoute("/service-functions")({
  head: () => ({ meta: [
    { title: "Service Functions & Active Tests | Vehicle Insight Hub" }, { name: "description", content: "Execute only imported, sourced service functions after applicability, hardware, safety and authorization checks." },
    { property: "og:title", content: "Service Functions & Active Tests | Vehicle Insight Hub" }, { property: "og:description", content: "No undocumented routine identifiers are built in." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: ServiceFunctionsPage,
});

function ServiceFunctionsPage() {
  const obd = useObd();
  const [definitions, setDefinitions] = useState<ServiceDefinition[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [safe, setSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  useEffect(() => setDefinitions(loadServiceDefinitions()), []);
  const definition = definitions.find((d) => d.id === selected) ?? null;
  const vehicle = obd.vehicles.find((v) => v.id === obd.activeVehicleId) ?? null;
  const operator = loadOperator();
  const authorization = permissionState(operator, "SECURITY_DIAGNOSTICS");
  const applicable = Boolean(definition && vehicle && definitionApplies(definition, vehicle, definition.applicability.ecu, obd.protocolName));

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try { const added = importServiceDefinitions(await file.text()); setDefinitions(loadServiceDefinitions()); toast.success(`Imported ${added.length} sourced definition(s)`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "SERVICE DEFINITION UNAVAILABLE"); }
  };
  const execute = async () => {
    if (!definition) return;
    const blocked = obd.state !== "connected" ? "UNSUPPORTED BY ADAPTER" : !applicable ? "VEHICLE/ECU APPLICABILITY NOT VERIFIED" : !safe ? "SAFETY ACKNOWLEDGEMENT REQUIRED" : definition.authorizationRequired && authorization !== "GRANTED" ? "AUTHORIZATION REQUIRED" : null;
    if (blocked) { setResponse(blocked); return; }
    setBusy(true);
    let result: "SUCCESS" | "FAILED" | "UNCONFIRMED" = "UNCONFIRMED";
    const errors: string[] = [];
    try {
      const header = await obd.sendRaw(`ATSH${definition.applicability.ecu}`);
      if (!/OK/i.test(header)) throw new Error(`ADAPTER INITIALIZATION FAILED: ${header}`);
      const raw = await obd.sendRaw(definition.request);
      const validation = validateServiceResponse(definition, raw);
      result = validation.result; setResponse(`${result}\n${validation.evidence}`);
      if (result === "SUCCESS") toast.success("Positive ECU response validated"); else toast.error(result);
    } catch (e) { const message = e instanceof Error ? e.message : "HARDWARE COMMUNICATION UNAVAILABLE"; errors.push(message); setResponse(message); result = "FAILED"; }
    finally {
      await obd.sendRaw("ATSH7DF").catch(() => undefined);
      await appendAudit({ user: operator.name || "Unnamed operator", role: operator.role, vehicle: vehicle?.id ?? null, vin: obd.vin, ecu: definition.applicability.ecu, file: definition.provenance.originalFileName ?? null, calibration: null, operation: definition.name, permission: "SECURITY_DIAGNOSTICS", authorization, hardware: obd.adapterName || null, result, errors });
      setBusy(false);
    }
  };
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">Service Functions & Active Tests</h1><p className="text-sm text-muted-foreground">No routine identifiers are built in. Import a legitimate, licensed definition for the exact vehicle and ECU.</p></header>
    <section className="panel p-5"><label className="flex cursor-pointer items-center gap-2 text-sm"><Upload className="size-4"/> Import sourced definition JSON<input className="sr-only" type="file" accept="application/json" onChange={(e) => void importFile(e.target.files?.[0])}/></label></section>
    {definitions.length === 0 ? <p className="panel readout p-5 text-sm text-muted-foreground">SERVICE DEFINITION UNAVAILABLE — no sourced functions imported.</p> : <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="panel p-4"><h2 className="font-semibold">Definitions</h2><ul className="mt-3 space-y-2">{definitions.map((d) => <li key={d.id}><Button className="w-full justify-start" variant={selected === d.id ? "default" : "outline"} onClick={() => { setSelected(d.id); setSafe(false); setResponse(null); }}>{d.name}</Button></li>)}</ul></section>
      <section className="panel p-5">{!definition ? <p className="readout text-sm text-muted-foreground">Select a function.</p> : <><h2 className="flex items-center gap-2 font-semibold"><Wrench className="size-4 text-signal"/>{definition.name}</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><Row l="Kind" v={definition.kind}/><Row l="Source" v={definition.provenance.sourceName}/><Row l="Source URL" v={definition.provenance.sourceUrl}/><Row l="License" v={definition.provenance.license}/><Row l="Imported" v={definition.provenance.importedAt}/><Row l="Version / revision" v={`${definition.provenance.version ?? "UNAVAILABLE"} / ${definition.provenance.revision ?? "UNAVAILABLE"}`}/><Row l="ECU" v={definition.applicability.ecu}/><Row l="Protocol" v={definition.applicability.protocol}/><Row l="Applicability" v={`${definition.applicability.make} ${definition.applicability.model ?? ""}`}/><Row l="Authorization" v={definition.authorizationRequired ? authorization : "NOT REQUIRED"}/><Row l="Hardware" v={obd.state === "connected" ? obd.adapterName : "UNSUPPORTED BY ADAPTER"}/><Row l="Vehicle match" v={applicable ? "VERIFIED" : "NOT VERIFIED"}/></dl>
        <div className="mt-4 rounded border border-warn/40 p-3 text-sm text-warn">{definition.safetyWarning}</div>
        <label className="mt-3 flex items-start gap-2 text-sm"><Checkbox checked={safe} onCheckedChange={(v) => setSafe(v === true)}/> I checked every precondition and authorise this exact operation.</label>
        <Button className="mt-3" disabled={busy || !safe} onClick={() => void execute()}>{busy ? "Waiting for ECU…" : "Send real request"}</Button>
        <pre className="readout mt-3 min-h-20 whitespace-pre-wrap rounded border border-border bg-background p-3 text-xs">{response ?? "No request sent."}</pre></>}</section>
    </div>}
  </div>;
}
function Row({l,v}:{l:string;v:string}) { return <div className="flex justify-between gap-3 border-b border-border/50 py-1"><dt className="text-muted-foreground">{l}</dt><dd className="readout text-right">{v}</dd></div>; }
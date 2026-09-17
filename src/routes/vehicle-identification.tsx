import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Fingerprint, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useObd } from "@/lib/obd/store";
import { loadCoverage, type CoverageEntry } from "@/lib/obd/coverage";
import { identifyVehicle, type VinOrigin } from "@/lib/obd/vehicle-identification";

export const Route = createFileRoute("/vehicle-identification")({
  head: () => ({
    meta: [
      { title: "Vehicle Identification (AutoVIN) | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Reads the VIN from the vehicle controller, validates it and resolves only the attributes an imported dataset can actually confirm.",
      },
      { property: "og:title", content: "Vehicle Identification (AutoVIN) | Vehicle Insight Hub" },
      { property: "og:description", content: "Attributes with no verified source stay UNKNOWN." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VehicleIdPage,
});

function VehicleIdPage() {
  const { state, vin, sendRaw, readVehicleInfo } = useObd();
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [raw, setRaw] = useState<string | null>(null);
  const [origin, setOrigin] = useState<VinOrigin | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState({ make: "", model: "", year: "", market: "", engine: "", transmission: "" });

  useEffect(() => setCoverage(loadCoverage()), []);
  useEffect(() => {
    if (vin && !origin) {
      setOrigin("DIAGNOSTIC RESPONSE (MODE 09 PID 02)");
      setTimestamp(Date.now());
    }
  }, [vin, origin]);

  const profile = useMemo(
    () => identifyVehicle({ vin: vin ?? null, vinOrigin: origin, rawResponse: raw, timestamp, manual }, coverage),
    [vin, origin, raw, timestamp, manual, coverage],
  );

  async function readEcuVin() {
    setBusy(true);
    setError(null);
    try {
      await readVehicleInfo();
      const response = await sendRaw("0902");
      setRaw(response.trim());
      setOrigin("DIAGNOSTIC RESPONSE (MODE 09 PID 02)");
      setTimestamp(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "HARDWARE COMMUNICATION UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Vehicle identification</h1>
        <p className="text-sm text-muted-foreground">
          The VIN is read from the vehicle, validated, then matched against imported coverage data. Nothing is guessed
          from an unsupported source.
        </p>
      </header>

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={state !== "connected" || busy} onClick={() => void readEcuVin()}>
            <Search className="size-4" /> Read VIN from vehicle
          </Button>
          <Badge variant="outline" className="readout text-[10px]">
            {state === "connected" ? "ADAPTER CONNECTED" : "OBD ADAPTER NOT CONNECTED"}
          </Badge>
          <Badge
            variant={profile.state === "AUTO IDENTIFIED" ? "secondary" : "outline"}
            className="readout text-[10px]"
          >
            {profile.state}
          </Badge>
        </div>
        {error && <p className="readout text-xs text-danger">{error}</p>}
        <div className="readout grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>VIN: {profile.vin ?? "IDENTIFICATION UNAVAILABLE"}</div>
          <div>Source: {profile.vinOrigin ?? "—"}</div>
          <div>Length valid: {profile.vinValid ? "YES" : "NO"}</div>
          <div>
            Check digit:{" "}
            {profile.vinCheckDigitOk == null ? "NOT VERIFIABLE" : profile.vinCheckDigitOk ? "VALID" : "INVALID"}
          </div>
          <div className="sm:col-span-2">Raw response: {profile.rawResponse ?? "—"}</div>
          <div className="sm:col-span-2">
            Read at: {profile.timestamp ? new Date(profile.timestamp).toLocaleString() : "—"}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Fingerprint className="size-4 text-signal" /> Vehicle profile
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {profile.attributes.map((attribute) => (
            <li
              key={attribute.label}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="w-32 text-muted-foreground">{attribute.label}</span>
              <span className="readout font-medium">{attribute.value ?? "UNKNOWN"}</span>
              <Badge variant="outline" className="readout ml-auto text-[10px]">{attribute.origin}</Badge>
              {attribute.evidence && (
                <span className="readout w-full text-xs text-muted-foreground">Evidence: {attribute.evidence}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-semibold">Manual vehicle selection</h2>
        <p className="text-xs text-muted-foreground">
          Anything entered here is labelled USER ENTERED and never presented as a vehicle response.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["make", "Make"],
              ["model", "Model"],
              ["year", "Model year"],
              ["market", "Market"],
              ["engine", "Engine"],
              ["transmission", "Transmission"],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              placeholder={label}
              value={manual[key]}
              onChange={(e) => setManual({ ...manual, [key]: e.target.value })}
            />
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Coverage matches</h2>
        {profile.coverageMatches.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">
            NO MATCHING COVERAGE ENTRY — IMPORT COVERAGE DATA TO RESOLVE SUPPORT
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {profile.coverageMatches.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border p-3">
                {entry.make} {entry.model} · {entry.ecu} · {entry.system}
                <p className="readout mt-1 text-xs text-muted-foreground">{entry.provenance.sourceName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertTriangle, BadgeCheck, Cpu, Database, LoaderCircle, Printer, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { useObd, uid, type Vehicle } from "@/lib/obd/store";
import { decodeVin } from "@/lib/obd/vin";
import { lookupVinDatabase } from "@/lib/obd/vin.functions";

export const Route = createFileRoute("/vehicle")({
  head: () => ({
    meta: [
      { title: "Vehicle Info & VIN Decode — TorqueDeck" },
      {
        name: "description",
        content:
          "Read Mode 09 vehicle information: VIN, calibration ID and ECU name, with a full VIN breakdown including manufacturer, region and model year.",
      },
      { property: "og:title", content: "Vehicle Info & VIN Decode — TorqueDeck" },
      {
        property: "og:description",
        content: "VIN, calibration ID and ECU identification read straight from the controller.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VehiclePage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="readout text-sm font-medium">{value}</span>
    </div>
  );
}

function VehiclePage() {
  const {
    vin,
    calId,
    ecuName,
    protocolName,
    adapterName,
    readVehicleInfo,
    state,
    vehicles,
    activeVehicleId,
    saveVehicle,
    setActiveVehicleId,
  } = useObd();
  const [manual, setManual] = useState("");
  const target = manual.trim() || vin || "";
  const decoded = target ? decodeVin(target) : null;
  const lookupVin = useServerFn(lookupVinDatabase);
  const databaseQuery = useQuery({
    queryKey: ["official-vin", decoded?.vin],
    queryFn: () => lookupVin({ data: { vin: decoded?.vin ?? "" } }),
    enabled: decoded?.valid === true,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
  const official = databaseQuery.data;

  const engineDescription = official
    ? [
        official.engine,
        official.displacementLiters ? `${official.displacementLiters} L` : null,
        official.cylinders ? `${official.cylinders} cylinders` : null,
        official.horsepower ? `${official.horsepower} hp` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Unavailable"
    : "Unavailable";

  const matchByVin = vehicles.find((v) => v.vin && v.vin.toUpperCase() === decoded?.vin);
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId);
  const targetVehicle = matchByVin ?? activeVehicle ?? null;

  const saveOfficialToGarage = () => {
    if (!official || !decoded?.vin) return;
    const base: Vehicle =
      targetVehicle ??
      ({
        id: uid(),
        nickname: "",
        make: "",
        model: "",
        year: "",
        vin: "",
        plate: "",
        odometer: "",
        notes: "",
      } satisfies Vehicle);
    const updated: Vehicle = {
      ...base,
      vin: decoded.vin,
      make: official.make ?? base.make,
      model: official.model ?? base.model,
      year: official.modelYear ?? base.year,
      trim: [official.trim, official.series].filter(Boolean).join(" · ") || base.trim,
      engine: engineDescription === "Unavailable" ? base.engine : engineDescription,
      fuel: official.fuelType ?? base.fuel,
      nickname: base.nickname || [official.modelYear, official.make, official.model].filter(Boolean).join(" "),
      vinVerified: !official.warning && decoded.checkDigitOk !== false,
    };
    saveVehicle(updated);
    setActiveVehicleId(updated.id);
    toast.success(
      targetVehicle
        ? `Updated ${updated.nickname || updated.make} in your garage`
        : `Added ${updated.nickname || updated.make} to your garage`,
    );
  };


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vehicle Information</h1>
          <p className="text-sm text-muted-foreground">Mode 09 identification and VIN breakdown.</p>
        </div>
        <div className="no-print flex gap-2">
          <Button size="sm" disabled={state !== "connected"} onClick={() => void readVehicleInfo()}>
            <RefreshCw className="size-4" /> Re-read
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Export
          </Button>
        </div>
      </header>

      <OfflineNotice />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Cpu className="size-4 text-signal" /> Read from ECU
          </h2>
          <Row label="VIN (Mode 09 PID 02)" value={vin ?? "—"} />
          <Row label="Calibration ID (PID 04)" value={calId ?? "—"} />
          <Row label="ECU name (PID 0A)" value={ecuName ?? "—"} />
          <Row label="Active protocol" value={protocolName || "—"} />
          <Row label="Adapter" value={adapterName || "—"} />
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold">VIN decode</h2>
          <Input
            className="no-print mb-3"
            placeholder={vin ?? "Type a VIN to decode manually"}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            maxLength={17}
          />
          {decoded ? (
            <>
              <Row label="VIN" value={decoded.vin || "—"} />
              <Row label="Length valid" value={decoded.valid ? "Yes (17)" : `No (${decoded.vin.length})`} />
              <Row
                label="Check digit"
                value={
                  decoded.checkDigitOk == null
                    ? "—"
                    : decoded.checkDigitOk
                      ? "Passes ISO 3779"
                      : "Fails — VIN may be mistyped or non-standard"
                }
              />
              <Row label="Manufacturer (WMI)" value={decoded.manufacturer} />
              <Row label="Region" value={decoded.region} />
              <Row label="Model year" value={decoded.modelYear} />
              <Row label="Plant code" value={decoded.plantCode} />
              <Row label="Serial" value={decoded.serial || "—"} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect and read the VIN, or type one above. Decoding covers the WMI manufacturer,
              region, model-year character and check digit.
            </p>
          )}
        </section>
      </div>

      {decoded?.valid && (
        <section className="panel p-5" aria-live="polite">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Database className="size-4 text-signal" /> Official vehicle record
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Decoded live from the United States Department of Transportation vPIC database.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {official && !official.warning && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-ok">
                   <BadgeCheck className="size-4" /> VIN database matched
                </span>
              )}
              {official?.make && (
                <Button size="sm" className="no-print" onClick={saveOfficialToGarage}>
                  <Save className="size-4" />
                  {targetVehicle ? "Update car in garage" : "Save to garage"}
                </Button>
              )}
            </div>
          </div>
          {official?.make && (
            <p className="mb-3 text-xs text-muted-foreground">
               Saving stores the database make, model, year and engine with this garage entry.
            </p>
          )}

          {databaseQuery.isPending ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Looking up official vehicle data…
            </div>
          ) : databaseQuery.isError ? (
            <div className="flex items-start gap-2 rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{databaseQuery.error.message}</span>
            </div>
          ) : official ? (
            <>
              {official.warning && (
                <div className="mb-3 flex items-start gap-2 rounded border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{official.warning}</span>
                </div>
              )}
              <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
                <Row label="Manufacturer" value={official.manufacturer ?? "Unavailable"} />
                <Row label="Make" value={official.make ?? "Unavailable"} />
                <Row label="Model" value={official.model ?? "Unavailable"} />
                <Row label="Production / model year" value={official.modelYear ?? "Unavailable"} />
                <Row label="Trim / series" value={[official.trim, official.series].filter(Boolean).join(" · ") || "Unavailable"} />
                <Row label="Vehicle type" value={official.vehicleType ?? "Unavailable"} />
                <Row label="Body" value={official.bodyClass ?? "Unavailable"} />
                <Row label="Engine" value={engineDescription} />
                <Row label="Engine manufacturer" value={official.engineManufacturer ?? "Unavailable"} />
                <Row label="Fuel" value={official.fuelType ?? "Unavailable"} />
                <Row label="Transmission" value={official.transmission ?? "Unavailable"} />
                <Row label="Drive type" value={official.driveType ?? "Unavailable"} />
                <div className="md:col-span-2 xl:col-span-3">
                  <Row label="Assembly plant" value={official.plant ?? "Unavailable"} />
                </div>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

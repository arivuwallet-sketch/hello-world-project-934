import { createFileRoute } from "@tanstack/react-router";
import { Printer, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { useObd } from "@/lib/obd/store";
import { lookupDtc } from "@/lib/obd/dtc";
import type { MonitorStatus, ReadinessResult } from "@/lib/obd/monitors";

export const Route = createFileRoute("/deep-scan")({
  head: () => ({
    meta: [
      { title: "Standard OBD Deep Scan — TorqueDeck" },
      {
        name: "description",
        content:
          "Scan emissions-related OBD responders: fault memory, readiness monitors, Mode 06 test results and Mode 09 vehicle information.",
      },
      { property: "og:title", content: "Standard OBD Deep Scan — TorqueDeck" },
      {
        property: "og:description",
        content:
          "Standards-based OBD responders, fault memory, readiness, monitor tests and in-use performance counters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeepScanPage,
});

function MonitorRow({ m }: { m: MonitorStatus }) {
  return (
    <li className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className={m.supported ? "" : "text-muted-foreground"}>{m.name}</span>
      {!m.supported ? (
        <span className="text-xs uppercase tracking-wider text-muted-foreground">n/a</span>
      ) : m.complete ? (
        <span className="text-xs font-semibold uppercase tracking-wider text-ok">Ready</span>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wider text-warn">Not ready</span>
      )}
    </li>
  );
}

function ReadinessPanel({ title, data }: { title: string; data: ReadinessResult | null }) {
  return (
    <section className="panel p-5">
      <h2 className="font-display text-sm font-bold uppercase tracking-widest">{title}</h2>
      {!data ? (
        <p className="mt-3 text-sm text-muted-foreground">No data yet — run a deep scan.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant={data.milOn ? "destructive" : "secondary"}>
              MIL {data.milOn ? "on" : "off"}
            </Badge>
            <Badge variant="outline">{data.dtcCount} stored</Badge>
            <Badge variant="outline">
              {data.compressionIgnition ? "Diesel" : "Petrol"}
            </Badge>
          </div>
          <ul className="mt-3">
            {[...data.continuous, ...data.nonContinuous].map((m) => (
              <MonitorRow key={m.name} m={m} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function DeepScanPage() {
  const {
    state,
    deepScan,
    deepScanning,
    deepStep,
    lastDeepScan,
    ecus,
    readiness,
    readinessCycle,
    monitorTests,
    ipt,
    mode09,
    vehicles,
    activeVehicleId,
    vin,
  } = useObd();

  const connected = state === "connected";
  const car =
    vehicles.find((v) => v.vin && vin && v.vin.toUpperCase() === vin.toUpperCase()) ??
    vehicles.find((v) => v.id === activeVehicleId) ??
    null;
  const carLine = car
    ? [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ")
    : "";

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
           <h1 className="font-display text-2xl font-bold tracking-wide">Standard OBD deep scan</h1>
          <p className="text-sm text-muted-foreground">
            Emissions-related modules that answer standard OBD-II requests, with fault memory,
            readiness, monitor tests and vehicle information read live from the bus.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void deepScan()} disabled={!connected || deepScanning}>
            <Radar className="size-4" />
            {deepScanning ? "Scanning…" : "Run deep scan"}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Export report
          </Button>
        </div>
      </header>

      {car && (
        <section className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Vehicle</div>
            <div className="font-semibold">{carLine || car.nickname || "Saved vehicle"}</div>
          </div>
          {car.engine && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Engine</div>
              <div className="readout">{car.engine}</div>
            </div>
          )}
          {car.fuel && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Fuel</div>
              <div>{car.fuel}</div>
            </div>
          )}
          {car.vin && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">VIN</div>
              <div className="readout break-all">{car.vin}</div>
            </div>
          )}
          {car.vinVerified && <Badge variant="secondary">VIN database matched</Badge>}
          {car.fuel && readiness && (
            <Badge
              variant={
                /diesel/i.test(car.fuel) === readiness.compressionIgnition
                  ? "outline"
                  : "destructive"
              }
            >
              {/diesel/i.test(car.fuel) === readiness.compressionIgnition
                ? `${readiness.compressionIgnition ? "Diesel" : "Petrol"} monitor set matches VIN`
                : "Monitor set does not match VIN fuel type"}
            </Badge>
          )}
        </section>
      )}

      {!connected && <OfflineNotice />}

      {deepScanning && (
        <div className="panel p-4 text-sm text-muted-foreground">{deepStep || "Working…"}</div>
      )}
      {!deepScanning && lastDeepScan && (
        <div className="text-xs text-muted-foreground">
          Last deep scan {new Date(lastDeepScan).toLocaleString()}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest">
          OBD responders ({ecus.length})
        </h2>
        {ecus.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No OBD responders scanned yet. Connect an adapter and run a deep scan.
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {ecus.map((ecu) => {
              const groups = [
                ["Stored", ecu.stored],
                ["Pending", ecu.pending],
                ["Permanent", ecu.permanent],
              ] as const;
              const total = ecu.stored.length + ecu.pending.length + ecu.permanent.length;
              return (
                <article key={ecu.header} className="panel p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{ecu.label}</h3>
                      <span className="readout text-xs text-muted-foreground">{ecu.header}</span>
                    </div>
                    <Badge variant={total ? "destructive" : "secondary"}>
                      {total ? `${total} codes` : "No faults"}
                    </Badge>
                  </div>
                  {groups.map(([label, codes]) =>
                    codes.length === 0 ? null : (
                      <div key={label} className="mt-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {label}
                        </div>
                        <ul className="mt-1 space-y-1">
                          {codes.map((c) => {
                            const info = lookupDtc(c);
                            return (
                              <li key={label + c} className="text-sm">
                                <span className="readout font-bold text-signal">{c}</span>{" "}
                                <span className="text-muted-foreground">{info.title}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ),
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReadinessPanel title="Readiness — since codes cleared" data={readiness} />
        <ReadinessPanel title="Readiness — this drive cycle" data={readinessCycle} />
      </div>

      <section className="panel p-5">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest">
          Mode 06 on-board monitor tests ({monitorTests.length})
        </h2>
        {monitorTests.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No test results read yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2">Monitor</th>
                  <th className="py-2">Test</th>
                  <th className="py-2 text-right">Value</th>
                  <th className="py-2 text-right">Min</th>
                  <th className="py-2 text-right">Max</th>
                  <th className="py-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {monitorTests.map((t, i) => (
                  <tr key={`${t.mid}-${t.tid}-${i}`} className="border-t border-border/60">
                    <td className="py-1.5">{t.midName}</td>
                    <td className="py-1.5 text-muted-foreground">{t.tidName}</td>
                    <td className="readout py-1.5 text-right">
                      {t.value.toFixed(3)} {t.unit}
                    </td>
                    <td className="readout py-1.5 text-right text-muted-foreground">
                      {t.min === null ? "—" : t.min.toFixed(3)}
                    </td>
                    <td className="readout py-1.5 text-right text-muted-foreground">
                      {t.max === null ? "—" : t.max.toFixed(3)}
                    </td>
                    <td className="py-1.5 text-right">
                      {t.passed === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : t.passed ? (
                        <span className="font-semibold text-ok">Pass</span>
                      ) : (
                        <span className="font-semibold text-danger">Fail</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">
            Mode 09 vehicle information
          </h2>
          {mode09.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing read yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {mode09.map((m) => (
                <li key={m.pid} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="readout break-all text-right">{m.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">
            In-use performance tracking
          </h2>
          {ipt.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing read yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {ipt.map((r) => (
                <li key={r.label} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="readout">{r.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

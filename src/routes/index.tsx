import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Download, Pause, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gauge, MiniStat } from "@/components/obd/Gauge";
import { LiveChart } from "@/components/obd/LiveChart";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { DASH_PIDS, GRAPH_PIDS, PIDS, type PidId } from "@/lib/obd/pids";
import { useObd } from "@/lib/obd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TorqueDeck — Live OBD-II Diagnostics Dashboard" },
      {
        name: "description",
        content:
          "Browser-based OBD-II deep scanner: live sensor gauges, fault codes, freeze frame and CAN bus tools for USB and BLE ELM327 adapters.",
      },
      { property: "og:title", content: "TorqueDeck — Live OBD-II Diagnostics Dashboard" },
      {
        property: "og:description",
        content:
          "Live gauges, graphs and deep fault diagnostics straight from your car's ECU, in the browser.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const {
    live,
    history,
    milOn,
    dtcCount,
    dtcs,
    pendingDtcs,
    polling,
    setPolling,
    supportedPids,
    activePids,
    setActivePids,
    saveSession,
    state,
    vehicles,
    activeVehicleId,
    setActiveVehicleId,
  } = useObd();

  const toggle = (id: PidId) =>
    setActivePids(activePids.includes(id) ? activePids.filter((p) => p !== id) : [...activePids, id]);

  const secondary: PidId[] = ["stft1", "ltft1", "stft2", "ltft2", "map", "o2b1s1", "o2b1s2", "fuelLevel", "timing", "ambient", "baro", "runtime"];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Live Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Mode 01 sensor stream, refreshed as fast as the bus allows.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <select
            value={activeVehicleId ?? ""}
            onChange={(e) => setActiveVehicleId(e.target.value || null)}
            className="h-9 rounded-md border border-input bg-surface px-3 text-sm"
            aria-label="Active vehicle"
          >
            <option value="">Unassigned vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nickname || `${v.make} ${v.model}`}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setPolling(!polling)}>
            {polling ? <Pause className="size-4" /> : <Play className="size-4" />}
            {polling ? "Pause" : "Resume"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveSession()}>
            <Save className="size-4" /> Save session
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Download className="size-4" /> Export PDF
          </Button>
        </div>
      </header>

      <OfflineNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <div
          className={cn(
            "panel flex items-center gap-3 p-4",
            state !== "connected" ? "border-border" : milOn ? "border-danger/60" : "border-ok/40",
          )}
        >
          {state === "connected" && milOn ? (
            <AlertTriangle className="size-7 text-danger" />
          ) : (
            <CheckCircle2 className="size-7 text-ok" />
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Malfunction lamp
            </div>
            <div className="font-display text-lg font-semibold">
              {state !== "connected" ? "—" : milOn ? "ON" : "Off"}
            </div>
          </div>
        </div>
        <Link to="/codes" className="panel flex items-center justify-between p-4 hover:border-signal/50">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Stored codes</div>
            <div className="readout text-2xl font-semibold">{state === "connected" ? dtcs.length || dtcCount : "—"}</div>
          </div>
          <Badge variant={dtcs.length ? "destructive" : "secondary"}>
            {dtcs.length ? "Attention" : "Clear"}
          </Badge>
        </Link>
        <Link to="/codes" className="panel flex items-center justify-between p-4 hover:border-signal/50">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending codes</div>
            <div className="readout text-2xl font-semibold">{state === "connected" ? pendingDtcs.length : "—"}</div>
          </div>
          <Badge variant="secondary">Mode 07</Badge>
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Primary cluster
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {DASH_PIDS.map((p) => (
            <Gauge key={p} pid={p} value={live[p]} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Fuel, mixture &amp; environment
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {secondary.map((p) => (
            <MiniStat key={p} pid={p} value={live[p]} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Live graphs
        </h2>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {GRAPH_PIDS.map((p) => (
            <LiveChart key={p} pid={p} data={history[p]} />
          ))}
        </div>
      </section>

      <section className="no-print panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Polled parameters</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {state === "connected" && supportedPids.length
            ? `${supportedPids.length} parameters reported as supported by this ECU. Fewer selected PIDs means a faster refresh rate.`
            : "Select which parameters to request once connected. Fewer PIDs refresh faster."}
        </p>
        <div className="flex flex-wrap gap-2">
          {PIDS.filter((p) => !supportedPids.length || supportedPids.includes(p.id)).map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                activePids.includes(p.id)
                  ? "border-signal bg-signal/15 text-signal"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {p.short}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

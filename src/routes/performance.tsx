import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge, MapPin, Satellite, Timer, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";
import {
  advanceTracker,
  compareSpeeds,
  createTracker,
  finaliseAcceleration,
  finaliseQuarterMile,
  loadPerformanceSessions,
  parseDynoCsv,
  recordSession,
  savePerformanceSessions,
  type DynoRun,
  type PerformanceSample,
  type PerformanceSession,
  type RunTracker,
} from "@/lib/obd/performance";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance Measurement | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Measure 0-60 and quarter-mile runs from real OBD speed and GPS data, with dual-source comparison, sample quality and genuine dyno imports.",
      },
      { property: "og:title", content: "Performance Measurement | Vehicle Insight Hub" },
      { property: "og:description", content: "Real measurements only — no benchmark times, no generated dyno curves." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerformancePage,
});

const TARGET_KMH = 96.56; // 60 mph

function PerformancePage() {
  const { state, live, signalDetails, activeVehicleId, vin } = useObd();
  const [gps, setGps] = useState<{ speed: number | null; accuracy: number | null; lat: number | null; lon: number | null; error: string | null }>({
    speed: null,
    accuracy: null,
    lat: null,
    lon: null,
    error: "GPS PERMISSION NOT REQUESTED",
  });
  const [tracker, setTracker] = useState<RunTracker>(createTracker());
  const [sessions, setSessions] = useState<PerformanceSession[]>([]);
  const [dyno, setDyno] = useState<DynoRun | null>(null);
  const watchRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const lastSampleRef = useRef<number | null>(null);
  const running = useRef(false);

  useEffect(() => setSessions(loadPerformanceSessions()), []);

  const obdSpeed = live.speed ?? null;
  const rpm = live.rpm ?? null;
  const speedDetail = signalDetails.speed ?? null;

  const latest = useMemo<PerformanceSample>(() => {
    const now = Date.now();
    return {
      timestamp: now,
      obdSpeed,
      gpsSpeed: gps.speed,
      gpsAccuracyMeters: gps.accuracy,
      latitude: gps.lat,
      longitude: gps.lon,
      rpm,
      distance: distanceRef.current,
      source: obdSpeed != null && gps.speed != null ? "BOTH" : obdSpeed != null ? "OBD" : gps.speed != null ? "GPS" : "NONE",
      quality:
        obdSpeed == null && gps.speed == null
          ? "UNUSABLE"
          : gps.accuracy != null && gps.accuracy > 10
            ? "DEGRADED"
            : "GOOD",
    };
  }, [obdSpeed, gps, rpm]);

  const comparison = compareSpeeds(latest);

  const requestGps = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGps((prev) => ({ ...prev, error: "BROWSER API UNSUPPORTED" }));
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGps({
          speed: position.coords.speed == null ? null : Number((position.coords.speed * 3.6).toFixed(2)),
          accuracy: position.coords.accuracy ?? null,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          error: position.coords.speed == null ? "GPS SPEED NOT PROVIDED BY DEVICE" : null,
        });
      },
      (error) => setGps({ speed: null, accuracy: null, lat: null, lon: null, error: error.code === error.PERMISSION_DENIED ? "PERMISSION DENIED" : "DATA NOT AVAILABLE" }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  }, []);

  useEffect(() => () => {
    if (watchRef.current != null && typeof navigator !== "undefined") navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  /** Each real sample integrates distance and advances the state machine. */
  useEffect(() => {
    if (!running.current) return;
    const speedKmh = latest.obdSpeed ?? latest.gpsSpeed;
    if (speedKmh == null) return;
    const previous = lastSampleRef.current;
    lastSampleRef.current = latest.timestamp;
    if (previous != null) {
      const dt = (latest.timestamp - previous) / 1000;
      distanceRef.current += (speedKmh / 3.6) * dt;
    }
    setTracker((current) => advanceTracker(current, { ...latest, distance: distanceRef.current }, TARGET_KMH));
  }, [latest]);

  const arm = () => {
    distanceRef.current = 0;
    lastSampleRef.current = null;
    running.current = true;
    setTracker(createTracker());
    toast.info("Run armed — measurement starts when real speed data shows movement");
  };

  const stop = (kind: "0-60" | "quarter-mile") => {
    running.current = false;
    const result = kind === "0-60" ? finaliseAcceleration(tracker) : finaliseQuarterMile(tracker);
    if (result.unavailableReason) {
      toast.error(result.unavailableReason);
    }
    const session = recordSession({ vehicleId: activeVehicleId, vin, result, samples: tracker.samples });
    const next = [session, ...sessions];
    setSessions(next);
    savePerformanceSessions(next);
  };

  const importDyno = async (file: File | undefined) => {
    if (!file) return;
    try {
      setDyno(parseDynoCsv(await file.text(), file.name));
      toast.success(`Imported ${file.name}`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Performance Measurement</h1>
        <p className="text-sm text-muted-foreground">
          Runs are measured from real OBD speed and real GPS fixes. No timers drive the result, and no benchmark or dyno
          figures are generated.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="panel p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Gauge className="size-4" /> OBD speed
          </h2>
          <p className="readout mt-2 text-3xl">{obdSpeed == null ? "—" : `${obdSpeed.toFixed(1)}`}</p>
          <p className="text-xs text-muted-foreground">
            {obdSpeed == null
              ? state === "connected"
                ? "PID NOT SUPPORTED / DATA NOT AVAILABLE"
                : "OBD ADAPTER NOT CONNECTED"
              : `km/h · PID 0D · ${speedDetail?.ecu ?? "ECU unknown"} · ${speedDetail?.quality ?? "—"}`}
          </p>
        </article>

        <article className="panel p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Satellite className="size-4" /> GPS speed
          </h2>
          <p className="readout mt-2 text-3xl">{gps.speed == null ? "—" : gps.speed.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">
            {gps.error ?? `km/h · accuracy ±${(gps.accuracy ?? 0).toFixed(1)} m`}
          </p>
          {gps.error && (
            <button onClick={requestGps} className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs">
              Request location permission
            </button>
          )}
        </article>

        <article className="panel p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="size-4" /> Source comparison
          </h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Difference</dt><dd className="readout">{comparison.absoluteDifference == null ? "—" : `${comparison.absoluteDifference} km/h`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Relative</dt><dd className="readout">{comparison.relativeDifference == null ? "—" : `${(comparison.relativeDifference * 100).toFixed(1)} %`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><Badge variant={comparison.status === "VALID" ? "secondary" : "destructive"} className="readout text-[10px]">{comparison.status}</Badge></dd></div>
          </dl>
        </article>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Timer className="size-4 text-signal" /> Run measurement</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary" className="readout">{tracker.state}</Badge>
          <span className="text-muted-foreground">{tracker.samples.length} samples · {distanceRef.current.toFixed(1)} m measured</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={arm} className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-background">Arm run</button>
          <button onClick={() => stop("0-60")} className="rounded-md border border-border px-4 py-2 text-sm">Finish 0–60</button>
          <button onClick={() => stop("quarter-mile")} className="rounded-md border border-border px-4 py-2 text-sm">Finish quarter mile</button>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Historical real measurements</h2>
        {sessions.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">No recorded runs</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {sessions.map((session) => (
              <li key={session.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="readout text-[10px]">{session.label}</Badge>
                  <span className="readout">{session.result.kind}</span>
                  <span className="text-muted-foreground">{new Date(session.recordedAt).toLocaleString()}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div><dt className="text-muted-foreground">Elapsed</dt><dd className="readout">{session.result.elapsedSeconds ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Distance</dt><dd className="readout">{session.result.distanceMeters ?? "—"} m</dd></div>
                  <div><dt className="text-muted-foreground">Terminal speed</dt><dd className="readout">{session.result.terminalSpeedKmh ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Samples</dt><dd className="readout">{session.result.sampleCount}</dd></div>
                  <div><dt className="text-muted-foreground">Sources</dt><dd className="readout">{session.result.sources.join("/") || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">GPS accuracy</dt><dd className="readout">{session.result.worstGpsAccuracy ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Max Δ speed</dt><dd className="readout">{session.result.maxSpeedDifference ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Quality</dt><dd className="readout">{session.result.quality}</dd></div>
                </dl>
                {session.result.unavailableReason && (
                  <p className="readout mt-2 text-xs text-warn">{session.result.unavailableReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Upload className="size-4" /> Dyno import</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Import a genuine dyno CSV containing RPM, wheel power and torque columns. Results are never generated.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-3 text-sm"
          onChange={(event) => void importDyno(event.target.files?.[0])}
        />
        {dyno && (
          <p className="readout mt-3 text-sm">
            {dyno.sourceFileName} · run {dyno.runNumber} · {dyno.rows.length} rows · correction {dyno.correctionFactor ?? "UNAVAILABLE"}
          </p>
        )}
      </section>
    </div>
  );
}

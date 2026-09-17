import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { detectBrowserHardwareSupport } from "@/lib/obd/hardware";
import {
  EMPTY_WIZARD_EVIDENCE,
  evaluateWizard,
  wizardReady,
  type StageStatus,
} from "@/lib/obd/wizard";

export const Route = createFileRoute("/connection")({
  head: () => ({
    meta: [
      { title: "Connection Wizard | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Sixteen-stage connection workflow: browser capability, adapter, transport, protocol detection, ECU discovery, VIN and final validation — each stage proven by its own evidence.",
      },
      { property: "og:title", content: "Connection Wizard | Vehicle Insight Hub" },
      { property: "og:description", content: "A paired adapter is not a connected ECU. Every stage needs its own evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectionWizardPage,
});

const TONE: Record<StageStatus, string> = {
  PASSED: "border-signal/50 text-signal",
  "IN PROGRESS": "border-warn/50 text-warn",
  PENDING: "border-border text-muted-foreground",
  FAILED: "border-destructive/60 text-destructive",
  "UNSUPPORTED BY BROWSER": "border-destructive/60 text-destructive",
  "UNSUPPORTED BY ADAPTER": "border-destructive/60 text-destructive",
  "PERMISSION DENIED": "border-destructive/60 text-destructive",
  "NOT REQUIRED": "border-border text-muted-foreground",
  "EVIDENCE MISSING": "border-warn/50 text-warn",
};

function ConnectionWizardPage() {
  const {
    state,
    elm,
    adapterName,
    transport,
    protocolCode,
    protocolName,
    ecus,
    vin,
    supportedPids,
    vehicles,
    activeVehicleId,
    connect,
    readVehicleInfo,
    deepScan,
    deepScanning,
    deepStep,
    lastDeepScan,
    supportedSerial,
    supportedBluetooth,
  } = useObd();
  const [busy, setBusy] = useState<string | null>(null);
  const support = useMemo(() => detectBrowserHardwareSupport(), []);
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) ?? null;

  const evidence = {
    ...EMPTY_WIZARD_EVIDENCE,
    secureContext: support.secureContext,
    serial: support.serial || supportedSerial,
    bluetooth: support.bluetooth || supportedBluetooth,
    usb: support.usb,
    localAgent: null,
    selectedAdapter: adapterName || null,
    selectedTransport: transport === "serial" ? "Web Serial (USB / COM)" : transport === "bluetooth" ? "Web Bluetooth (BLE)" : null,
    discoveredDevice: adapterName || null,
    permissionGranted: transport ? true : null,
    transportOpen: state === "connected",
    adapterIdentity: elm.adapterVersion || null,
    initialisationLog: state === "connected" && protocolCode ? "Initialisation sequence completed" : null,
    protocolCode: protocolCode || null,
    protocolName: protocolName || null,
    respondingEcus: ecus.map((e) => e.header),
    vin,
    vehicleProfile: activeVehicle
      ? `${activeVehicle.year} ${activeVehicle.make} ${activeVehicle.model}${activeVehicle.vinVerified ? " (VIN verified)" : ""}`
      : null,
    supportedPidCount: supportedPids.length > 0 ? supportedPids.length : null,
    lastEcuResponseAt: supportedPids.length > 0 || ecus.length > 0 ? Date.now() : null,
    scanCompletedAt: lastDeepScan,
  };

  const results = evaluateWizard(evidence);
  const ready = wizardReady(results);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Connection Wizard</h1>
        <p className="text-sm text-muted-foreground">
          Sixteen stages, each proven separately. A paired adapter is not a connected adapter, a connected adapter is
          not a responding ECU, and a responding ECU does not guarantee a VIN.
        </p>
      </header>

      <div className="panel flex flex-wrap items-center gap-2 p-4">
        <Button size="sm" disabled={!evidence.serial || busy !== null} onClick={() => run("serial", () => connect("serial"))}>
          <PlugZap className="mr-2 size-4" /> Connect via USB / serial
        </Button>
        <Button size="sm" variant="secondary" disabled={!evidence.bluetooth || busy !== null} onClick={() => run("ble", () => connect("bluetooth"))}>
          Connect via Bluetooth LE
        </Button>
        <Button size="sm" variant="outline" disabled={state !== "connected" || busy !== null} onClick={() => run("vin", readVehicleInfo)}>
          Read VIN & module identity
        </Button>
        <Button size="sm" variant="outline" disabled={state !== "connected" || deepScanning} onClick={() => void deepScan()}>
          <RefreshCw className={`mr-2 size-4 ${deepScanning ? "animate-spin" : ""}`} /> Run full-system scan
        </Button>
        <Badge variant={ready ? "default" : "secondary"} className="readout ml-auto text-[10px]">
          {ready ? "READY" : "NOT READY"}
        </Badge>
      </div>

      {deepScanning && <p className="readout text-xs text-warn">{deepStep || "Scanning…"}</p>}

      <ol className="space-y-2">
        {results.map((result, index) => (
          <li key={result.stage} className={`panel border p-4 ${TONE[result.status]}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="readout text-xs text-muted-foreground">
                STEP {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-semibold text-foreground">{result.stage}</span>
              <Badge variant="outline" className={`readout ml-auto text-[10px] ${TONE[result.status]}`}>
                {result.status}
              </Badge>
            </div>
            <p className="readout mt-2 text-xs">
              {result.evidence ?? result.detail ?? "No evidence recorded for this stage yet."}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

import { Bluetooth, Cable, Plug, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { cn } from "@/lib/utils";

export function StatusDot() {
  const { state } = useObd();
  const tone =
    state === "connected"
      ? "bg-ok"
      : state === "connecting"
        ? "bg-warn"
        : state === "error"
          ? "bg-danger"
          : "bg-muted-foreground";
  return (
    <span
      className={cn("inline-block size-2.5 rounded-full", tone, state === "connected" && "live-dot")}
      aria-hidden
    />
  );
}

export function ConnectionBar() {
  const {
    state,
    statusText,
    adapterName,
    transport,
    protocolName,
    supportedSerial,
    supportedBluetooth,
    connect,
    disconnect,
    reconnect,
  } = useObd();

  const label =
    state === "connected"
      ? "Live"
      : state === "connecting"
        ? "Linking"
        : state === "error"
          ? "Fault"
          : "Offline";

  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-border bg-surface/70 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <StatusDot />
        <span className="font-display text-sm font-semibold uppercase tracking-widest">{label}</span>
      </div>

      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {state === "connected" ? (
          <span className="readout">
            {transport === "serial" ? "USB serial" : "BLE"} · {adapterName} · {protocolName}
          </span>
        ) : (
          statusText
        )}
      </div>

      {state === "connected" ? (
        <>
          <Button variant="outline" size="sm" onClick={() => void reconnect()}>
            <RefreshCw className="size-4" /> Reconnect
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            <Plug className="size-4" /> Disconnect
          </Button>
        </>
      ) : (
        <>
          <Button
            size="sm"
            disabled={!supportedSerial || state === "connecting"}
            onClick={() => void connect("serial")}
            title={supportedSerial ? "Connect a USB ELM327 adapter" : "This browser has no Web Serial support"}
          >
            <Cable className="size-4" /> USB adapter
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!supportedBluetooth || state === "connecting"}
            onClick={() => void connect("bluetooth")}
            title={supportedBluetooth ? "Connect a BLE OBD adapter" : "This browser has no Web Bluetooth support"}
          >
            <Bluetooth className="size-4" /> BLE adapter
          </Button>
        </>
      )}
    </div>
  );
}

export function OfflineNotice() {
  const { state, supportedSerial, connect } = useObd();
  if (state === "connected") return null;
  return (
    <div className="no-print panel flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
      <PlugZap className="size-6 shrink-0 text-signal" />
      <div className="flex-1">
        <p className="font-medium">No vehicle link</p>
        <p className="text-sm text-muted-foreground">
          Plug an ELM327 adapter into the OBD-II port, switch the ignition on, then connect. Live
          values and fault memory appear here once the ECU answers.
        </p>
      </div>
      <Button size="sm" disabled={!supportedSerial} onClick={() => void connect("serial")}>
        <Cable className="size-4" /> Connect
      </Button>
    </div>
  );
}

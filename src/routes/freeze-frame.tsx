import { createFileRoute } from "@tanstack/react-router";
import { Camera, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { useObd } from "@/lib/obd/store";
import { lookupDtc } from "@/lib/obd/dtc";

export const Route = createFileRoute("/freeze-frame")({
  head: () => ({
    meta: [
      { title: "Freeze Frame Data — TorqueDeck" },
      {
        name: "description",
        content:
          "Read OBD-II Mode 02 freeze frame data: the exact engine conditions captured when the ECU stored a fault code.",
      },
      { property: "og:title", content: "Freeze Frame Data — TorqueDeck" },
      {
        property: "og:description",
        content: "The snapshot of engine conditions captured at the moment a fault was set.",
      },
    ],
  }),
  component: FreezePage,
});

function FreezePage() {
  const { freeze, readFreezeFrame, state } = useObd();
  const dtcInfo = freeze?.dtc ? lookupDtc(freeze.dtc) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Freeze Frame</h1>
          <p className="text-sm text-muted-foreground">
            Mode 02 — the conditions the engine was running under when the fault was stored.
          </p>
        </div>
        <div className="no-print flex gap-2">
          <Button size="sm" disabled={state !== "connected"} onClick={() => void readFreezeFrame()}>
            <Camera className="size-4" /> Read frame
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Export
          </Button>
        </div>
      </header>

      <OfflineNotice />

      {freeze && dtcInfo && (
        <div className="panel p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Frame captured for
          </div>
          <div className="readout text-xl font-bold text-signal">{dtcInfo.code}</div>
          <div className="text-sm">{dtcInfo.title}</div>
        </div>
      )}

      {freeze && freeze.values.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {freeze.values.map((v) => (
            <div key={v.label} className="panel p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{v.label}</div>
              <div className="readout text-lg font-semibold">{v.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel p-6 text-sm text-muted-foreground">
          No freeze frame loaded yet. Connect, then press <strong>Read frame</strong>. An ECU only
          stores a frame when it commits an emissions-related fault, so a healthy car returns
          nothing here.
        </div>
      )}
    </div>
  );
}

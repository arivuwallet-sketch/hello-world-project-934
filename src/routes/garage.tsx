import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Car, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useObd, uid, type Vehicle } from "@/lib/obd/store";
import { decodeVin } from "@/lib/obd/vin";
import { lookupDtc } from "@/lib/obd/dtc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/garage")({
  head: () => ({
    meta: [
      { title: "Garage — Multi-Vehicle Tracking — TorqueDeck" },
      {
        name: "description",
        content:
          "Track several cars in one place: VIN, plate, odometer and notes per vehicle, with scan sessions filed against the right car.",
      },
      { property: "og:title", content: "Garage — Multi-Vehicle Tracking — TorqueDeck" },
      {
        property: "og:description",
        content: "Keep every car you service in one garage with its own scan history.",
      },
    ],
  }),
  component: GaragePage,
});

const empty = (): Vehicle => ({
  id: uid(),
  nickname: "",
  make: "",
  model: "",
  year: "",
  vin: "",
  plate: "",
  odometer: "",
  notes: "",
});

function GaragePage() {
  const {
    vehicles,
    saveVehicle,
    deleteVehicle,
    activeVehicleId,
    setActiveVehicleId,
    vin,
    sessions,
    vehicleCodeHistory,
    clearVehicleHistory,
  } = useObd();
  const [draft, setDraft] = useState<Vehicle | null>(null);

  const set = (k: keyof Vehicle, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide">Garage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every scan and saved session is filed against the selected vehicle.
          </p>
        </div>
        <div className="flex gap-2">
          {vin && !vehicles.some((v) => v.vin === vin) && (
            <Button
              variant="secondary"
              onClick={() => setDraft({ ...empty(), vin, nickname: "Connected car" })}
            >
              Add connected car ({vin.slice(-6)})
            </Button>
          )}
          <Button onClick={() => setDraft(empty())}>
            <Plus className="size-4" /> Add vehicle
          </Button>
        </div>
      </header>

      {vehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Car className="mx-auto mb-3 size-8 opacity-50" />
          No vehicles yet. Add one to start keeping a service history.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v) => {
            const active = v.id === activeVehicleId;
            const decoded = v.vin ? decodeVin(v.vin) : null;
            const count = sessions.filter((s) => s.vehicleId === v.id).length;
            const history = vehicleCodeHistory(v.id);
            return (
              <div
                key={v.id}
                className={cn(
                  "rounded-lg border bg-card p-4 transition-colors",
                  active ? "border-signal" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display font-semibold tracking-wide">
                      {v.nickname || `${v.make} ${v.model}`.trim() || "Untitled vehicle"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || "No details"}
                    </div>
                    {v.engine && <div className="text-xs text-muted-foreground">{v.engine}</div>}
                    {v.vinVerified && (
                      <div className="mt-1 inline-block rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ok">
                        VIN database matched
                      </div>
                    )}
                  </div>
                  {active && (
                    <span className="rounded bg-signal/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-signal">
                      Active
                    </span>
                  )}
                </div>

                <dl className="readout mt-3 space-y-1 text-xs text-muted-foreground">
                  {v.vin && <div>VIN {v.vin}</div>}
                  {v.plate && <div>Plate {v.plate}</div>}
                  {v.odometer && <div>{v.odometer} odometer</div>}
                  {decoded?.valid && (
                    <div>
                      {decoded.region} · {decoded.modelYear}
                    </div>
                  )}
                  <div>
                    {count} saved session{count === 1 ? "" : "s"} · {history.length} fault code
                    {history.length === 1 ? "" : "s"} on record
                  </div>
                </dl>
                {v.notes && <p className="mt-2 text-xs text-muted-foreground">{v.notes}</p>}

                {history.length > 0 && (
                  <div className="mt-3 rounded border border-border/70 bg-background/40 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Code history
                      </span>
                      <button
                        className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-danger"
                        onClick={() => clearVehicleHistory(v.id)}
                      >
                        Clear
                      </button>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {history.slice(0, 5).map((e) => (
                        <li key={e.id} className="flex items-baseline gap-2 text-xs">
                          <span className="readout font-semibold text-signal">{e.code}</span>
                          <span className="truncate text-muted-foreground">
                            {lookupDtc(e.code).title}
                          </span>
                          <span
                            className={cn(
                              "ml-auto shrink-0 text-[10px] uppercase tracking-wider",
                              e.clearedAt ? "text-muted-foreground" : "text-warn",
                            )}
                          >
                            {e.clearedAt ? "cleared" : e.kind}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {history.length > 5 && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        +{history.length - 5} more
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={active ? "secondary" : "default"}
                    onClick={() => setActiveVehicleId(active ? null : v.id)}
                  >
                    <Check className="size-3.5" /> {active ? "Deselect" : "Select"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(v)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/sessions" search={{ vehicle: v.id }}>
                      History
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-danger"
                    onClick={() => deleteVehicle(v.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vehicle details</DialogTitle>
            <DialogDescription>Stored on this computer only.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Nickname"
                value={draft.nickname}
                onChange={(e) => set("nickname", e.target.value)}
              />
              <Input placeholder="Year" value={draft.year} onChange={(e) => set("year", e.target.value)} />
              <Input placeholder="Make" value={draft.make} onChange={(e) => set("make", e.target.value)} />
              <Input placeholder="Model" value={draft.model} onChange={(e) => set("model", e.target.value)} />
              <Input
                placeholder="VIN"
                value={draft.vin}
                onChange={(e) => set("vin", e.target.value.toUpperCase())}
              />
              <Input placeholder="Plate" value={draft.plate} onChange={(e) => set("plate", e.target.value)} />
              <Input
                placeholder="Odometer"
                value={draft.odometer}
                onChange={(e) => set("odometer", e.target.value)}
                className="sm:col-span-2"
              />
              <Textarea
                placeholder="Notes — recent work, known faults…"
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="sm:col-span-2"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (draft) {
                  saveVehicle(draft);
                  setActiveVehicleId(draft.id);
                }
                setDraft(null);
              }}
            >
              Save vehicle
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

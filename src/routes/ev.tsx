import { createFileRoute } from "@tanstack/react-router";
import { BatteryWarning, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EV_SECTIONS, EV_SIGNAL_SLOTS, evSlotStatus, type EvSection } from "@/lib/obd/ev";
import { signalRegistry } from "@/lib/obd/registry";

export const Route = createFileRoute("/ev")({
  head: () => ({
    meta: [
      { title: "EV Diagnostics | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Dataset-driven EV battery, cell, thermal, charging, motor and inverter diagnostics with strict provenance and no fabricated values.",
      },
      { property: "og:title", content: "EV Diagnostics | Vehicle Insight Hub" },
      { property: "og:description", content: "Real EV signals only — every reading traced to an imported, licensed definition." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EvPage,
});

function EvPage() {
  const registry = signalRegistry();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">EV Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          EV signals exist only when an imported dataset defines them for the selected vehicle and ECU. No universal EV
          PIDs are hardcoded.
        </p>
      </header>

      <div className="panel flex items-start gap-3 border-warn/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <p className="text-muted-foreground">
          Battery, cell and charging values are never estimated. Where no definition resolves, the signal stays
          unavailable rather than showing a plausible number.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {EV_SECTIONS.map((sectionName) => (
          <SectionCard key={sectionName} section={sectionName} registry={registry} />
        ))}
      </div>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <BatteryWarning className="size-4 text-warn" /> Cell visualisation
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cell-by-cell voltage and temperature charts appear once an ECU actually returns per-cell data. Missing cells
          remain missing — the pack array is never padded to a nominal cell count.
        </p>
        <p className="readout mt-4 text-sm text-muted-foreground">SIGNAL DEFINITION UNAVAILABLE — no per-cell data received</p>
      </section>
    </div>
  );
}

function SectionCard({ section, registry }: { section: EvSection; registry: ReturnType<typeof signalRegistry> }) {
  const slots = EV_SIGNAL_SLOTS.filter((slot) => slot.section === section);
  return (
    <article className="panel p-5">
      <h2 className="font-semibold">{section}</h2>
      <ul className="mt-4 space-y-3 text-sm">
        {slots.map((slot) => {
          const status = evSlotStatus(slot, registry);
          return (
            <li key={slot.id} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{slot.label}</span>
              {status.state === "AVAILABLE" ? (
                <span className="readout text-right">
                  {status.resolved.definition.unit}
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    {status.resolved.provenance.sourceName}
                  </span>
                </span>
              ) : (
                <Badge variant="secondary" className="readout shrink-0 text-[10px]">
                  {status.state}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

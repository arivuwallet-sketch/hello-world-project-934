import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Puzzle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PLUGIN_KINDS, listPlugins } from "@/lib/obd/plugins";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "Extensions | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Extension points for adapter drivers, transports, protocol decoders, PID and fault-code definitions, EV datasets, OEM integrations, report formats and analytics.",
      },
      { property: "og:title", content: "Extensions | Vehicle Insight Hub" },
      { property: "og:description", content: "Extensions contribute definitions and drivers — never vehicle data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PluginsPage,
});

function PluginsPage() {
  const registered = useMemo(() => listPlugins(), []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Extensions</h1>
        <p className="text-sm text-muted-foreground">
          Where new hardware drivers, decoders and signal definitions plug in. Each one must declare its source,
          licence and import date before it is accepted.
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Puzzle className="size-4 text-signal" /> Extension points</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PLUGIN_KINDS.map((kind) => {
            const installed = registered.filter((plugin) => plugin.kind === kind.kind);
            return (
              <li key={kind.kind} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span>{kind.label}</span>
                <Badge variant={installed.length > 0 ? "secondary" : "outline"} className="readout text-[10px]">
                  {installed.length > 0 ? `${installed.length} INSTALLED` : "NONE INSTALLED"}
                </Badge>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Installed extensions</h2>
        {registered.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">NO EXTENSIONS INSTALLED</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {registered.map((plugin) => (
              <li key={plugin.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{plugin.name}</span>
                  <Badge variant="outline" className="readout text-[10px]">{plugin.kind}</Badge>
                </div>
                <p className="readout mt-1 text-xs text-muted-foreground">
                  {plugin.provenance.sourceName} · {plugin.provenance.license} ·{" "}
                  <a href={plugin.provenance.sourceUrl} className="underline" target="_blank" rel="noreferrer">
                    {plugin.provenance.sourceUrl}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Extensions may not inject vehicle data, and definitions they supply still pass through the same validation
          and provenance checks as any imported dataset. Manufacturer-specific commands without a cited source stay
          UNSUPPORTED / UNDOCUMENTED.
        </p>
      </section>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Database, ExternalLink, FileCheck2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BUILT_IN_SOURCES } from "@/lib/obd/sources";

export const Route = createFileRoute("/data-sources")({
  head: () => ({
    meta: [
      { title: "Diagnostic Data Sources | Vehicle Insight Hub" },
      { name: "description", content: "Inspect diagnostic signal provenance, licenses, revisions, checksums, and import status." },
      { property: "og:title", content: "Diagnostic Data Sources | Vehicle Insight Hub" },
      { property: "og:description", content: "Trace every imported diagnostic definition to its source and license." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DataSourcesPage,
});

function DataSourcesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Data Sources</h1>
        <p className="text-sm text-muted-foreground">Signal definitions are inactive until provenance and schema validation pass.</p>
      </header>
      <div className="panel flex items-start gap-3 border-warn/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <p className="text-muted-foreground">Community definitions are not OEM-authoritative. Vehicle-specific signals require an exact vehicle and firmware match.</p>
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        {BUILT_IN_SOURCES.map(({ provenance }) => (
          <article key={provenance.sourceName} className="panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-signal" />
                <div><h2 className="font-semibold">{provenance.sourceName}</h2><p className="text-xs text-muted-foreground">{provenance.format}</p></div>
              </div>
              <Badge variant="secondary">{provenance.classification}</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">License</dt><dd>{provenance.license}</dd>
              <dt className="text-muted-foreground">Attribution</dt><dd>{provenance.attribution}</dd>
              <dt className="text-muted-foreground">Imported</dt><dd className="readout">{new Date(provenance.importedAt).toISOString().slice(0, 10)}</dd>
              <dt className="text-muted-foreground">Revision</dt><dd>{provenance.revision}</dd>
              <dt className="text-muted-foreground">Checksum</dt><dd className="readout">{provenance.checksum ?? "NOT IMPORTED"}</dd>
              <dt className="text-muted-foreground">Entries</dt><dd className="readout">{provenance.entryCount ?? "DATA NOT AVAILABLE"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd className="flex items-center gap-2"><FileCheck2 className="size-4 text-warn" />REFERENCE REGISTERED</dd>
            </dl>
            <a className="mt-5 inline-flex items-center gap-2 text-sm text-signal" href={provenance.sourceUrl} target="_blank" rel="noreferrer">Open source <ExternalLink className="size-4" /></a>
          </article>
        ))}
      </section>
    </div>
  );
}
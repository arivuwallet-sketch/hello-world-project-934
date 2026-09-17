import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Database, ExternalLink, ShieldAlert, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BUILT_IN_SOURCES } from "@/lib/obd/sources";
import { SOURCE_CATALOG } from "@/lib/obd/catalog";
import { DatasetImport } from "@/components/obd/DatasetImport";
import {
  loadImportedCanDatasets,
  loadImportedObdDatasets,
  removeImportedCanDataset,
  removeImportedObdDataset,
  restoreImportedDatasets,
} from "@/lib/obd/dataset-store";
import type { DatasetProvenance } from "@/lib/obd/provenance";

export const Route = createFileRoute("/data-sources")({
  head: () => ({
    meta: [
      { title: "Diagnostic Data Sources | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Import opendbc CAN databases, OBDb signal sets, EV PID files and Torque CSV lists, and trace every definition to its source, licence and checksum.",
      },
      { property: "og:title", content: "Diagnostic Data Sources | Vehicle Insight Hub" },
      { property: "og:description", content: "Trace every imported diagnostic definition to its source and licence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DataSourcesPage,
});

function ProvenanceCard({
  provenance,
  status,
  onRemove,
}: {
  provenance: DatasetProvenance;
  status: string;
  onRemove?: () => void;
}) {
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Database className="size-5 text-signal" />
          <div>
            <h3 className="font-semibold">{provenance.sourceName}</h3>
            <p className="text-xs text-muted-foreground">{provenance.format ?? "Format not recorded"}</p>
          </div>
        </div>
        <Badge variant="secondary">{provenance.classification}</Badge>
      </div>
      <dl className="mt-5 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Licence</dt>
        <dd>{provenance.license}</dd>
        <dt className="text-muted-foreground">Attribution</dt>
        <dd>{provenance.attribution ?? "NOT RECORDED"}</dd>
        <dt className="text-muted-foreground">Imported</dt>
        <dd className="readout">{new Date(provenance.importedAt).toISOString().slice(0, 10)}</dd>
        <dt className="text-muted-foreground">File</dt>
        <dd className="readout break-all">{provenance.originalFileName ?? "NOT IMPORTED"}</dd>
        <dt className="text-muted-foreground">Revision</dt>
        <dd>{provenance.revision ?? "NOT CLAIMED"}</dd>
        <dt className="text-muted-foreground">Checksum</dt>
        <dd className="readout break-all">
          {provenance.checksum ? `${provenance.checksum.slice(0, 24)}…` : "NOT IMPORTED"}
        </dd>
        <dt className="text-muted-foreground">Entries</dt>
        <dd className="readout">{provenance.entryCount ?? "DATA NOT AVAILABLE"}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="readout">{status}</dd>
      </dl>
      <div className="mt-5 flex items-center justify-between gap-3">
        <a className="inline-flex items-center gap-2 text-sm text-signal" href={provenance.sourceUrl} target="_blank" rel="noreferrer">
          Open source <ExternalLink className="size-4" />
        </a>
        {onRemove && (
          <button onClick={onRemove} className="inline-flex items-center gap-2 text-xs text-danger hover:underline">
            <Trash2 className="size-4" /> Remove
          </button>
        )}
      </div>
    </article>
  );
}

function DataSourcesPage() {
  const [obdDatasets, setObdDatasets] = useState<{ provenance: DatasetProvenance; count: number }[]>([]);
  const [canDatasets, setCanDatasets] = useState<{ provenance: DatasetProvenance; count: number }[]>([]);

  const refresh = useCallback(() => {
    setObdDatasets(loadImportedObdDatasets().map((d) => ({ provenance: d.provenance, count: d.signals.length })));
    setCanDatasets(loadImportedCanDatasets().map((d) => ({ provenance: d.provenance, count: d.signals.length })));
  }, []);

  useEffect(() => {
    restoreImportedDatasets();
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Data Sources</h1>
        <p className="text-sm text-muted-foreground">
          Signal definitions are inactive until provenance and schema validation pass.
        </p>
      </header>

      <div className="panel flex items-start gap-3 border-warn/40 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <p className="text-muted-foreground">
          Community definitions are not OEM-authoritative. Vehicle-specific signals require an exact vehicle and
          firmware match, and a wrong match decodes into a wrong number — verify against your own car before trusting a
          reading.
        </p>
      </div>

      <DatasetImport onImported={refresh} />

      <section>
        <h2 className="text-lg font-semibold">Imported definitions</h2>
        {obdDatasets.length === 0 && canDatasets.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">NO DATASETS IMPORTED</p>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {canDatasets.map((dataset) => (
              <ProvenanceCard
                key={dataset.provenance.sourceName}
                provenance={dataset.provenance}
                status={`ACTIVE ON CAN MONITOR — ${dataset.count} signals`}
                onRemove={() => {
                  removeImportedCanDataset(dataset.provenance.sourceName);
                  refresh();
                }}
              />
            ))}
            {obdDatasets.map((dataset) => (
              <ProvenanceCard
                key={dataset.provenance.sourceName}
                provenance={dataset.provenance}
                status={`ACTIVE FOR DIAGNOSTICS — ${dataset.count} signals`}
                onRemove={() => {
                  removeImportedObdDataset(dataset.provenance.sourceName);
                  refresh();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Reference catalogue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where the definitions come from, what each one legitimately covers, and how it may be used.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">External diagnostic data sources with licence and permitted use</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="py-2 pr-4">Source</th>
                <th scope="col" className="py-2 pr-4">Use</th>
                <th scope="col" className="py-2 pr-4">Format</th>
                <th scope="col" className="py-2 pr-4">Licence</th>
                <th scope="col" className="py-2">Covers</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_CATALOG.map((entry) => (
                <tr key={entry.id} className="border-t border-border/60 align-top">
                  <td className="py-3 pr-4">
                    <a href={entry.url} target="_blank" rel="noreferrer" className="text-signal underline">
                      {entry.name}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.attribution}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={entry.use === "IMPORTABLE DATA" ? "secondary" : "outline"} className="readout text-[10px]">
                      {entry.use}
                    </Badge>
                  </td>
                  <td className="readout py-3 pr-4 text-xs">{entry.format}</td>
                  <td className="py-3 pr-4 text-xs">{entry.license}</td>
                  <td className="py-3 text-xs text-muted-foreground">
                    {entry.covers}
                    <p className="mt-1 text-warn">{entry.caveat}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Registered references</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {BUILT_IN_SOURCES.map(({ provenance }) => (
            <ProvenanceCard key={provenance.sourceName} provenance={provenance} status="REFERENCE REGISTERED — NO FILE IMPORTED" />
          ))}
        </div>
      </section>
    </div>
  );
}

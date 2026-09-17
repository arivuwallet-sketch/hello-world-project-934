import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COVERAGE_FUNCTIONS,
  capabilityState,
  coverageMark,
  coverageScopeStatement,
  importCoverage,
  loadCoverage,
  queryCoverage,
  saveCoverage,
  type CoverageEntry,
} from "@/lib/obd/coverage";

export const Route = createFileRoute("/coverage")({
  head: () => ({
    meta: [
      { title: "OEM Coverage & Licensing | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Function-level diagnostic coverage per make, model, ECU and system — every claim shown with its imported source, licence and evidence.",
      },
      { property: "og:title", content: "OEM Coverage & Licensing | Vehicle Insight Hub" },
      {
        property: "og:description",
        content: "Coverage is only ever what an imported, licensed dataset actually documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoveragePage,
});

function CoveragePage() {
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [license, setLicense] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setEntries(loadCoverage()), []);

  const query = useMemo(
    () => ({
      ...(make.trim() ? { make: make.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      year: Number.isFinite(Number(year)) && year.trim() ? Number(year) : null,
    }),
    [make, model, year],
  );

  const matches = useMemo(() => queryCoverage(query, entries), [query, entries]);

  async function onFile(file: File) {
    if (!sourceName.trim() || !/^https:\/\//i.test(sourceUrl.trim()) || !license.trim()) {
      setNotice("Source name, https source URL and licence are required before a coverage file is accepted.");
      return;
    }
    const text = await file.text();
    const result = importCoverage(text, {
      sourceName: sourceName.trim(),
      sourceUrl: sourceUrl.trim(),
      license: license.trim(),
      importedAt: new Date().toISOString(),
      classification: "MANUFACTURER-SPECIFIC",
      originalFileName: file.name,
      entryCount: undefined,
    });
    if (result.accepted.length === 0) {
      setNotice(`No entries accepted. ${result.rejected.map((item) => item.reason).join("; ")}`);
      return;
    }
    const next = [...result.accepted, ...entries.filter((entry) => entry.provenance.sourceName !== sourceName.trim())];
    saveCoverage(next);
    setEntries(next);
    setNotice(
      `${result.accepted.length} coverage entries imported${result.rejected.length ? `, ${result.rejected.length} rejected for missing evidence or provenance` : ""}.`,
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">OEM coverage &amp; licensing</h1>
        <p className="text-sm text-muted-foreground">
          Coverage is not asserted by this application. It is read from coverage datasets you import, with the source,
          licence and evidence kept alongside every capability.
        </p>
        <p className="readout mt-2 text-xs text-muted-foreground">{coverageScopeStatement(entries)}</p>
      </header>

      <section className="panel space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Upload className="size-4 text-signal" /> Import a coverage dataset
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Source name" value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          <Input placeholder="https:// source URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          <Input placeholder="Licence" value={license} onChange={(e) => setLicense(e.target.value)} />
        </div>
        <input
          type="file"
          accept=".json,application/json"
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        <p className="text-xs text-muted-foreground">
          Entries without a documented evidence string are rejected rather than repaired. Nothing is marked supported
          because it looks likely.
        </p>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <BookOpenCheck className="size-4 text-signal" /> Function-level support
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Make" value={make} onChange={(e) => setMake(e.target.value)} />
          <Input placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
          <Input placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        {entries.length === 0 ? (
          <p className="readout text-sm text-muted-foreground">NO COVERAGE DATA IMPORTED</p>
        ) : (
          <div className="grid gap-2">
            {COVERAGE_FUNCTIONS.map((fn) => {
              const capability = capabilityState(fn, query, entries);
              return (
                <div key={fn} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="readout w-5 text-center font-bold">{coverageMark(capability.state)}</span>
                    <span className="font-medium">{fn}</span>
                    <Badge variant="outline" className="readout ml-auto text-[10px]">
                      {capability.state}
                    </Badge>
                  </div>
                  <p className="readout mt-1 text-xs text-muted-foreground">
                    Evidence: {capability.evidence}
                    {capability.hardwareRequirement ? ` · Hardware: ${capability.hardwareRequirement}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Matching coverage entries</h2>
        {matches.length === 0 ? (
          <p className="readout mt-3 text-sm text-muted-foreground">NO MATCHING COVERAGE ENTRY — DATA UNAVAILABLE</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {matches.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {entry.make} {entry.model} {entry.generation ?? ""}
                  </span>
                  <Badge variant="outline" className="readout text-[10px]">
                    {entry.ecu} · {entry.system}
                  </Badge>
                  {entry.protocol && (
                    <Badge variant="secondary" className="readout text-[10px]">{entry.protocol}</Badge>
                  )}
                </div>
                <p className="readout mt-1 text-xs text-muted-foreground">
                  {entry.yearFrom ?? "?"}–{entry.yearTo ?? "?"} · market {entry.market ?? "UNKNOWN"} · engine{" "}
                  {entry.engine ?? "UNKNOWN"} · fuel {entry.fuelType ?? "UNKNOWN"}
                </p>
                <p className="readout mt-1 text-xs text-muted-foreground">
                  {entry.provenance.sourceName} · {entry.provenance.license} ·{" "}
                  <a className="underline" href={entry.provenance.sourceUrl} target="_blank" rel="noreferrer">
                    {entry.provenance.sourceUrl}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => {
            saveCoverage([]);
            setEntries([]);
            setNotice("Imported coverage data removed.");
          }}
        >
          Remove imported coverage data
        </Button>
      </section>
    </div>
  );
}

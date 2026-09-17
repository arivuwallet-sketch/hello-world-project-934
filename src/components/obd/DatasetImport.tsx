import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOURCE_CATALOG, type CatalogEntry } from "@/lib/obd/catalog";
import { parseDbc, type CanSignalDataset } from "@/lib/obd/importers/dbc";
import { parseObdbSignalSet } from "@/lib/obd/importers/obdb";
import { parseTorqueCsv } from "@/lib/obd/importers/torque";
import { parseEvPidFile } from "@/lib/obd/importers/iternio";
import { saveImportedCanDataset, saveImportedObdDataset } from "@/lib/obd/dataset-store";
import type { SignalDataset } from "@/lib/obd/datasets";

const IMPORTABLE = SOURCE_CATALOG.filter((entry) => entry.use === "IMPORTABLE DATA");

interface Props {
  onImported?: () => void;
}

export function DatasetImport({ onImported }: Props) {
  const [sourceId, setSourceId] = useState<string>(IMPORTABLE[0]?.id ?? "");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const source: CatalogEntry | undefined = IMPORTABLE.find((entry) => entry.id === sourceId);

  const handleFile = async (file: File) => {
    if (!source) return;
    setBusy(true);
    setNotes([]);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      const vehicle = make || model ? { ...(make ? { make } : {}), ...(model ? { model } : {}) } : undefined;
      const provenance = {
        sourceName: `${source.name}${model ? ` — ${model}` : ""}`,
        sourceUrl: source.url,
        license: source.license,
        importedAt: new Date().toISOString(),
        classification: source.classification,
        attribution: source.attribution,
        format: source.format,
        originalFileName: file.name,
      };

      if (source.format === "DBC") {
        const parsed = parseDbc(text);
        const dataset: CanSignalDataset = { provenance, signals: parsed.signals };
        const stored = await saveImportedCanDataset(dataset, bytes);
        setNotes([
          `${parsed.messages} CAN messages read, ${stored.signals.length} signals now decodable on the CAN Monitor.`,
          ...(parsed.skipped.length > 0 ? [`${parsed.skipped.length} lines skipped rather than guessed.`] : []),
        ]);
      } else {
        const parsed =
          source.id === "iternio-ev" || source.id === "mg-zs-ev"
            ? parseEvPidFile(text, file.name, vehicle)
            : source.format === "Torque CSV"
              ? parseTorqueCsv(text, vehicle)
              : parseObdbSignalSet(text, vehicle);
        const dataset: SignalDataset = { provenance, signals: parsed.signals };
        const stored = await saveImportedObdDataset(dataset, bytes);
        setNotes([
          `${stored.signals.length} signal definitions imported and available for live data.`,
          ...(parsed.unconvertible.length > 0
            ? [
                `${parsed.unconvertible.length} entries left out because their formula could not be converted without guessing:`,
                ...parsed.unconvertible.slice(0, 5),
              ]
            : []),
        ]);
      }
      toast.success("Import complete", { description: `${source.name} · ${source.license}` });
      onImported?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setNotes([message]);
      toast.error("Import rejected", { description: message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Upload className="size-4 text-signal" /> Import signal definitions
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Download the file from the source repository, then import it here. The licence, attribution, source link and a
        SHA-256 of the exact file you imported are all recorded.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Source
          <select
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {IMPORTABLE.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({entry.format})
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-muted-foreground">
          Licence
          <p className="readout mt-1 rounded-md border border-border px-3 py-1.5 text-sm text-foreground">
            {source?.license ?? "—"}
          </p>
        </div>
        <label className="text-xs text-muted-foreground">
          Make (optional)
          <input
            value={make}
            onChange={(event) => setMake(event.target.value)}
            placeholder="MG"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Model (optional)
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="ZS EV"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      {source && <p className="mt-3 text-xs text-warn">{source.caveat}</p>}

      <div className="mt-4 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".dbc,.json,.csv,.txt"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy || !source}>
          {busy ? "Reading file…" : "Choose file"}
        </Button>
        {source && (
          <a href={source.url} target="_blank" rel="noreferrer" className="text-sm text-signal underline">
            Open {source.name}
          </a>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="readout mt-4 space-y-1 rounded-md border border-border p-3 text-xs">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Imported definitions are declarative only — no formula from a file is ever executed as code, and an entry that
        cannot be converted safely is reported and left out rather than approximated.{" "}
        <Badge variant="outline" className="readout text-[10px]">
          NO SOURCE = NO DATA
        </Badge>
      </p>
    </section>
  );
}

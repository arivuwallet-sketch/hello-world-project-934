import type { HardwareAdapter, HardwareTransportKind } from "./hardware";
import type { SignalDataset } from "./datasets";
import type { DatasetProvenance } from "./provenance";

/**
 * Extension points. Plugins contribute drivers, decoders and definitions —
 * never vehicle data. Anything a plugin supplies must still travel through the
 * normal validation and provenance pipeline before it can reach the UI.
 */
export type PluginKind =
  | "adapter-driver"
  | "transport"
  | "protocol-decoder"
  | "pid-definitions"
  | "dtc-database"
  | "ev-dataset"
  | "oem-integration"
  | "report-format"
  | "analytics";

export interface PluginBase {
  id: string;
  name: string;
  kind: PluginKind;
  provenance: DatasetProvenance;
}

export interface AdapterDriverPlugin extends PluginBase {
  kind: "adapter-driver";
  transport: HardwareTransportKind;
  create: () => HardwareAdapter;
}

export interface DatasetPlugin extends PluginBase {
  kind: "pid-definitions" | "ev-dataset" | "dtc-database";
  dataset: SignalDataset;
}

export interface DecoderPlugin extends PluginBase {
  kind: "protocol-decoder";
  decodeFrame: (bytes: number[]) => { label: string; detail: string } | null;
}

export interface ReportFormatPlugin extends PluginBase {
  kind: "report-format";
  extension: string;
  serialize: (report: unknown) => string;
}

export type Plugin = AdapterDriverPlugin | DatasetPlugin | DecoderPlugin | ReportFormatPlugin;

export type PluginRegistration =
  | { ok: true }
  | { ok: false; reason: string };

const registry = new Map<string, Plugin>();

function provenanceComplete(provenance: DatasetProvenance | undefined): boolean {
  return Boolean(
    provenance && provenance.sourceName && provenance.sourceUrl && provenance.license && provenance.importedAt,
  );
}

export function registerPlugin(plugin: Plugin): PluginRegistration {
  if (!plugin.id || !plugin.name) return { ok: false, reason: "Plugin is missing an id or name" };
  if (!provenanceComplete(plugin.provenance)) {
    return { ok: false, reason: "Plugin rejected: source, source URL, licence and import date are all required" };
  }
  const existing = registry.get(plugin.id);
  if (existing && existing.kind !== plugin.kind) {
    return { ok: false, reason: `Plugin id conflict with existing ${existing.kind} plugin` };
  }
  registry.set(plugin.id, plugin);
  return { ok: true };
}

export function unregisterPlugin(id: string): boolean {
  return registry.delete(id);
}

export function listPlugins(kind?: PluginKind): Plugin[] {
  const all = [...registry.values()];
  return kind ? all.filter((plugin) => plugin.kind === kind) : all;
}

export const PLUGIN_KINDS: { kind: PluginKind; label: string }[] = [
  { kind: "adapter-driver", label: "Adapter drivers" },
  { kind: "transport", label: "Transports" },
  { kind: "protocol-decoder", label: "Protocol decoders" },
  { kind: "pid-definitions", label: "PID definitions" },
  { kind: "dtc-database", label: "Fault code databases" },
  { kind: "ev-dataset", label: "EV datasets" },
  { kind: "oem-integration", label: "OEM integrations" },
  { kind: "report-format", label: "Report formats" },
  { kind: "analytics", label: "Analytics" },
];

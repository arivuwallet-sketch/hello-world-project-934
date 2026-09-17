import type { ResolvedSignal, SignalDataset } from "./datasets";

export interface SignalConflict {
  id: string;
  sources: string[];
}

export class DatasetRegistry {
  private datasets = new Map<string, SignalDataset>();

  register(dataset: SignalDataset) {
    if (this.datasets.has(dataset.provenance.sourceName)) {
      throw new Error(`Dataset already registered: ${dataset.provenance.sourceName}`);
    }
    this.datasets.set(dataset.provenance.sourceName, dataset);
  }

  unregister(sourceName: string) {
    this.datasets.delete(sourceName);
  }

  list() {
    return [...this.datasets.values()];
  }

  resolve(id: string): ResolvedSignal | null {
    const matches = this.matches(id);
    if (matches.length > 1) {
      throw new Error(`SIGNAL DEFINITION CONFLICT: ${matches.map((m) => m.provenance.sourceName).join(", ")}`);
    }
    return matches[0] ?? null;
  }

  getSource(id: string) {
    return this.resolve(id)?.provenance ?? null;
  }

  getProvenance(sourceName: string) {
    return this.datasets.get(sourceName)?.provenance ?? null;
  }

  validate(): SignalConflict[] {
    const ids = new Set(this.list().flatMap((dataset) => dataset.signals.map((signal) => signal.id)));
    return [...ids].flatMap((id) => {
      const matches = this.matches(id);
      return matches.length > 1
        ? [{ id, sources: matches.map((match) => match.provenance.sourceName) }]
        : [];
    });
  }

  private matches(id: string): ResolvedSignal[] {
    return this.list().flatMap((dataset) =>
      dataset.signals
        .filter((signal) => signal.id === id)
        .map((definition) => ({ definition, provenance: dataset.provenance })),
    );
  }
}
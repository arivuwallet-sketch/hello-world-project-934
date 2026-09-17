import type { DatasetProvenance } from "./provenance";

export type DeclarativeFormula =
  | { operation: "identity"; byte: number }
  | { operation: "offset"; byte: number; offset: number }
  | { operation: "scale"; byte: number; multiplier: number; offset?: number }
  | { operation: "uint16"; highByte: number; lowByte: number; divisor?: number; offset?: number };

export interface SignalDefinition {
  id: string;
  name: string;
  mode: number;
  pid: string;
  bytes: number;
  unit: string;
  min?: number;
  max?: number;
  formula: DeclarativeFormula;
  ecu?: string;
  vehicle?: { make?: string; model?: string; yearFrom?: number; yearTo?: number };
}

export interface SignalDataset {
  provenance: DatasetProvenance;
  signals: SignalDefinition[];
}

export interface ResolvedSignal {
  definition: SignalDefinition;
  provenance: DatasetProvenance;
}
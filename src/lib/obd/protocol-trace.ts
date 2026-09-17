/**
 * Module 128 — unified protocol trace analyzer.
 *
 * The trace records real exchanges only. Failures keep their distinct identity:
 * a rejection, a transport error, a timeout and an invalid response are never
 * collapsed into one generic error.
 */
import { analyzeNegativeResponse, type NegativeResponseAnalysis } from "./nrc";

export type TraceProtocol = "OBD" | "CAN" | "ISO-TP" | "UDS" | "DOIP";
export type TraceDirection = "REQUEST" | "RESPONSE";
export type TraceResult =
  | "SUCCESSFUL RESPONSE"
  | "ECU REJECTED REQUEST"
  | "TRANSPORT ERROR"
  | "TIMEOUT"
  | "INVALID RESPONSE"
  | "UNSUPPORTED"
  | "PENDING";

export interface TraceEntry {
  id: string;
  timestampMs: number;
  direction: TraceDirection;
  protocol: TraceProtocol;
  ecu: string | null;
  canId: string | null;
  service: string | null;
  did: string | null;
  request: string | null;
  response: string | null;
  latencyMs: number | null;
  result: TraceResult;
  negative: NegativeResponseAnalysis | null;
  interpretation: string | null;
}

export interface RawExchange {
  id: string;
  timestampMs: number;
  protocol: TraceProtocol;
  ecu?: string | null;
  canId?: string | null;
  request: string;
  response: string | null;
  latencyMs: number | null;
  transport?: "OK" | "TIMEOUT" | "ERROR";
}

function serviceOf(request: string): string | null {
  const bytes = request.match(/[0-9a-f]{2}/gi);
  return bytes?.[0]?.toUpperCase() ?? null;
}

function didOf(request: string): string | null {
  const bytes = request.match(/[0-9a-f]{2}/gi)?.map((byte) => byte.toUpperCase());
  if (!bytes || bytes[0] !== "22" || bytes.length < 3) return null;
  return `${bytes[1]}${bytes[2]}`;
}

function classify(exchange: RawExchange): { result: TraceResult; negative: NegativeResponseAnalysis | null } {
  const transport = exchange.transport ?? "OK";
  if (transport === "TIMEOUT") return { result: "TIMEOUT", negative: null };
  if (transport === "ERROR") return { result: "TRANSPORT ERROR", negative: null };
  const response = exchange.response?.trim() ?? "";
  if (!response) return { result: "TIMEOUT", negative: null };
  if (/^NO DATA$/i.test(response)) return { result: "UNSUPPORTED", negative: null };
  if (/UNABLE TO CONNECT|BUS ERROR|CAN ERROR|FB ERROR/i.test(response)) {
    return { result: "TRANSPORT ERROR", negative: null };
  }
  if (/^(STOPPED|\?|BUFFER FULL)$/i.test(response)) return { result: "INVALID RESPONSE", negative: null };
  if (/7f/i.test(response)) {
    const negative = analyzeNegativeResponse(response);
    if (negative.nrc != null) {
      return { result: negative.classification === "RESPONSE PENDING" ? "PENDING" : "ECU REJECTED REQUEST", negative };
    }
    return { result: "INVALID RESPONSE", negative };
  }
  if (!/[0-9a-f]{2}/i.test(response)) return { result: "INVALID RESPONSE", negative: null };
  return { result: "SUCCESSFUL RESPONSE", negative: null };
}

export function buildTrace(exchanges: RawExchange[]): TraceEntry[] {
  const entries: TraceEntry[] = [];
  for (const exchange of exchanges) {
    const { result, negative } = classify(exchange);
    const service = serviceOf(exchange.request);
    const did = didOf(exchange.request);
    entries.push({
      id: `${exchange.id}-req`,
      timestampMs: exchange.timestampMs,
      direction: "REQUEST",
      protocol: exchange.protocol,
      ecu: exchange.ecu ?? null,
      canId: exchange.canId ?? null,
      service,
      did,
      request: exchange.request,
      response: null,
      latencyMs: null,
      result: "PENDING",
      negative: null,
      interpretation: null,
    });
    entries.push({
      id: `${exchange.id}-res`,
      timestampMs: exchange.timestampMs + (exchange.latencyMs ?? 0),
      direction: "RESPONSE",
      protocol: exchange.protocol,
      ecu: exchange.ecu ?? null,
      canId: exchange.canId ?? null,
      service,
      did,
      request: exchange.request,
      response: exchange.response,
      latencyMs: exchange.latencyMs,
      result,
      negative,
      interpretation:
        result === "ECU REJECTED REQUEST"
          ? negative?.descriptionAvailable
            ? `NRC 0x${negative.nrcHex}: ${negative.description}`
            : "NEGATIVE RESPONSE RECEIVED — NRC DESCRIPTION UNAVAILABLE"
          : result === "SUCCESSFUL RESPONSE"
            ? "Positive response received"
            : result,
    });
  }
  return entries.sort((a, b) => a.timestampMs - b.timestampMs);
}

export function traceSummary(entries: TraceEntry[]) {
  const responses = entries.filter((entry) => entry.direction === "RESPONSE");
  const counts = new Map<TraceResult, number>();
  for (const entry of responses) counts.set(entry.result, (counts.get(entry.result) ?? 0) + 1);
  const latencies = responses.map((entry) => entry.latencyMs).filter((value): value is number => value != null);
  return {
    exchanges: responses.length,
    counts: [...counts.entries()].map(([result, count]) => ({ result, count })),
    averageLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
  };
}

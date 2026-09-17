/**
 * Connection health from counted events only. There is deliberately no
 * "connection quality percentage" — every field below is a real tally or a
 * measured latency.
 */
export interface ConnectionHealth {
  requests: number;
  responses: number;
  timeouts: number;
  retries: number;
  disconnects: number;
  frameErrors: number;
  latencySamples: number[];
}

export const EMPTY_HEALTH: ConnectionHealth = {
  requests: 0,
  responses: 0,
  timeouts: 0,
  retries: 0,
  disconnects: 0,
  frameErrors: 0,
  latencySamples: [],
};

const MAX_SAMPLES = 200;

export type HealthEvent =
  | { kind: "request" }
  | { kind: "response"; latencyMs: number }
  | { kind: "timeout" }
  | { kind: "retry" }
  | { kind: "disconnect" }
  | { kind: "frameError" };

export function applyHealthEvent(health: ConnectionHealth, event: HealthEvent): ConnectionHealth {
  switch (event.kind) {
    case "request":
      return { ...health, requests: health.requests + 1 };
    case "response":
      return {
        ...health,
        responses: health.responses + 1,
        latencySamples: [...health.latencySamples, event.latencyMs].slice(-MAX_SAMPLES),
      };
    case "timeout":
      return { ...health, timeouts: health.timeouts + 1 };
    case "retry":
      return { ...health, retries: health.retries + 1 };
    case "disconnect":
      return { ...health, disconnects: health.disconnects + 1 };
    case "frameError":
      return { ...health, frameErrors: health.frameErrors + 1 };
  }
}

export interface HealthSummary {
  responseRate: string;
  latencyLastMs: string;
  latencyMedianMs: string;
  latencyWorstMs: string;
  timeouts: number;
  retries: number;
  disconnects: number;
  frameErrors: number;
  requests: number;
}

export function summariseHealth(health: ConnectionHealth): HealthSummary {
  const samples = [...health.latencySamples].sort((a, b) => a - b);
  const median = samples.length > 0 ? samples[Math.floor(samples.length / 2)] : undefined;
  const worst = samples.length > 0 ? samples[samples.length - 1] : undefined;
  const last = health.latencySamples[health.latencySamples.length - 1];
  return {
    responseRate:
      health.requests === 0 ? "DATA UNAVAILABLE" : `${health.responses} / ${health.requests} answered`,
    latencyLastMs: last == null ? "DATA UNAVAILABLE" : last.toFixed(0),
    latencyMedianMs: median == null ? "DATA UNAVAILABLE" : median.toFixed(0),
    latencyWorstMs: worst == null ? "DATA UNAVAILABLE" : worst.toFixed(0),
    timeouts: health.timeouts,
    retries: health.retries,
    disconnects: health.disconnects,
    frameErrors: health.frameErrors,
    requests: health.requests,
  };
}

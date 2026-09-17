import { PID_BY_ID, type PidId } from "@/lib/obd/pids";
import { cn } from "@/lib/utils";

interface GaugeProps {
  pid: PidId;
  value: number | undefined;
  size?: "lg" | "sm";
}

const ARC_START = 135;
const ARC_SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function Gauge({ pid, value, size = "lg" }: GaugeProps) {
  const def = PID_BY_ID[pid];
  if (!def) return null;
  const has = typeof value === "number" && Number.isFinite(value);
  const clamped = has ? Math.min(Math.max(value as number, def.min), def.max) : def.min;
  const frac = (clamped - def.min) / (def.max - def.min || 1);
  const dim = size === "lg" ? 168 : 128;
  const cx = dim / 2;
  const r = dim / 2 - 14;
  const endAngle = ARC_START + ARC_SWEEP * frac;

  let tone = "var(--color-signal)";
  if (has && def.nominal) {
    const [lo, hi] = def.nominal;
    if ((value as number) < lo || (value as number) > hi) tone = "var(--color-warn)";
    if (def.id === "coolant" && (value as number) > 110) tone = "var(--color-danger)";
    if ((value as number) >= lo && (value as number) <= hi) tone = "var(--color-ok)";
  }

  return (
    <div className="panel flex flex-col items-center gap-1 px-3 py-4">
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label={def.label}>
        <path
          d={arcPath(cx, cx, r, ARC_START, ARC_START + ARC_SWEEP)}
          fill="none"
          stroke="var(--color-grid)"
          strokeWidth={size === "lg" ? 12 : 9}
          strokeLinecap="round"
        />
        {def.nominal && (
          <path
            d={arcPath(
              cx,
              cx,
              r,
              ARC_START + ARC_SWEEP * ((def.nominal[0] - def.min) / (def.max - def.min)),
              ARC_START + ARC_SWEEP * ((def.nominal[1] - def.min) / (def.max - def.min)),
            )}
            fill="none"
            stroke="var(--color-ok)"
            strokeOpacity={0.22}
            strokeWidth={size === "lg" ? 12 : 9}
            strokeLinecap="butt"
          />
        )}
        {has && frac > 0.001 && (
          <path
            d={arcPath(cx, cx, r, ARC_START, endAngle)}
            fill="none"
            stroke={tone}
            strokeWidth={size === "lg" ? 12 : 9}
            strokeLinecap="round"
            style={{ transition: "d 200ms linear" }}
          />
        )}
        <text
          x={cx}
          y={cx + (size === "lg" ? 4 : 2)}
          textAnchor="middle"
          className="readout fill-foreground"
          fontSize={size === "lg" ? 28 : 22}
          fontWeight={600}
        >
          {has ? (value as number).toFixed(def.decimals ?? 0) : "—"}
        </text>
        <text
          x={cx}
          y={cx + (size === "lg" ? 26 : 20)}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={11}
        >
          {def.unit}
        </text>
      </svg>
      <span
        className={cn(
          "text-center text-xs font-medium uppercase tracking-wider text-muted-foreground",
        )}
      >
        {def.label}
      </span>
    </div>
  );
}

export function MiniStat({ pid, value }: { pid: PidId; value: number | undefined }) {
  const def = PID_BY_ID[pid];
  if (!def) return null;
  const has = typeof value === "number" && Number.isFinite(value);
  const out = has ? (value as number).toFixed(def.decimals ?? 0) : "—";
  let tone = "text-foreground";
  if (has && def.nominal) {
    const [lo, hi] = def.nominal;
    tone = (value as number) < lo || (value as number) > hi ? "text-warn" : "text-ok";
  }
  return (
    <div className="panel px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{def.short}</div>
      <div className={cn("readout text-lg font-semibold", tone)}>
        {out}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{def.unit}</span>
      </div>
    </div>
  );
}

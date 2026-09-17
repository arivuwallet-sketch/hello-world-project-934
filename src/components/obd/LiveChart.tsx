import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PID_BY_ID, type PidId } from "@/lib/obd/pids";
import type { Sample } from "@/lib/obd/store";

export function LiveChart({ pid, data }: { pid: PidId; data: Sample[] | undefined }) {
  const def = PID_BY_ID[pid];
  if (!def) return null;
  const series = (data ?? []).map((s) => ({
    t: new Date(s.t).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
    v: s.v,
  }));

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{def.label}</h3>
        <span className="readout text-xs text-muted-foreground">
          {series.length ? `${series[series.length - 1]?.v} ${def.unit}` : `— ${def.unit}`}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} minTickGap={40} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              domain={["auto", "auto"]}
              width={46}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-muted-foreground)" }}
              formatter={(v: number | string) => [`${v} ${def.unit}`, def.short]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="var(--color-signal)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

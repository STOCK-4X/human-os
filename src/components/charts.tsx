"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatDay } from "@/lib/date";

type Tokens = Record<"accent" | "muted" | "line" | "surface" | "ink" | "accentSoft" | "chart2", string>;

/** Resolve CSS tokens to concrete colours for SVG, re-reading when the theme changes. */
function useTokens(): Tokens {
  const read = (): Tokens => {
    if (typeof window === "undefined")
      return { accent: "#3d6b5e", muted: "#6c6d68", line: "#e6e4df", surface: "#fff", ink: "#1b1c1b", accentSoft: "#e3eeea", chart2: "#8a7bb8" };
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return {
      accent: v("--accent"),
      muted: v("--muted"),
      line: v("--line"),
      surface: v("--surface"),
      ink: v("--ink"),
      accentSoft: v("--accent-soft"),
      chart2: v("--chart-2"),
    };
  };
  const [t, setT] = useState<Tokens>(read);
  useEffect(() => {
    const update = () => setT(read());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  return t;
}

export interface SeriesPoint {
  date: string;
  value?: number;
}

const short = (d: string) => formatDay(d, "d MMM");

function TooltipBox({ active, payload, label, fmt, tokens }: { active?: boolean; payload?: { value: number }[]; label?: string; fmt: (n: number) => string; tokens: Tokens }) {
  if (!active || !payload?.length || payload[0].value === undefined) return null;
  return (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.line}`, color: tokens.ink }} className="rounded-lg px-2 py-1 text-xs shadow">
      <div style={{ color: tokens.muted }}>{label && formatDay(label, "EEE d MMM")}</div>
      <div className="tabular font-medium">{fmt(payload[0].value)}</div>
    </div>
  );
}

/**
 * Trend over time. Missing days are gaps (never zero). Optional personal
 * baseline band and target line.
 */
export function TrendChart({
  data,
  kind = "line",
  band,
  target,
  fmt = (n) => String(Math.round(n)),
  height = 160,
  domain,
  label,
}: {
  data: SeriesPoint[];
  kind?: "line" | "bar";
  band?: { low: number; high: number };
  target?: number;
  fmt?: (n: number) => string;
  height?: number;
  domain?: [number | "auto", number | "auto"];
  label: string;
}) {
  const t = useTokens();
  const axis = { stroke: t.muted, fontSize: 11, tickLine: false, axisLine: false } as const;
  const common = (
    <>
      <CartesianGrid vertical={false} stroke={t.line} strokeDasharray="3 3" />
      <XAxis dataKey="date" tickFormatter={short} {...axis} minTickGap={24} />
      <YAxis {...axis} width={36} tickFormatter={fmt} domain={domain ?? ["auto", "auto"]} />
      <Tooltip content={<TooltipBox fmt={fmt} tokens={t} />} cursor={{ fill: t.accentSoft, stroke: t.line }} />
      {band && <ReferenceArea y1={band.low} y2={band.high} fill={t.accentSoft} fillOpacity={0.8} ifOverflow="extendDomain" />}
      {target !== undefined && <ReferenceLine y={target} stroke={t.muted} strokeDasharray="4 4" ifOverflow="extendDomain" />}
    </>
  );
  return (
    <figure aria-label={label} className="-mx-1">
      <ResponsiveContainer width="100%" height={height}>
        {kind === "bar" ? (
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            {common}
            <Bar dataKey="value" fill={t.accent} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            {common}
            <Line
              dataKey="value"
              stroke={t.accent}
              strokeWidth={2}
              dot={{ r: 2.5, fill: t.accent, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}

/** Scatter of two metrics for relationship exploration. */
export function RelationChart({ points, xLabel, yLabel }: { points: { x: number; y: number }[]; xLabel: string; yLabel: string }) {
  const t = useTokens();
  const axis = { stroke: t.muted, fontSize: 11, tickLine: false, axisLine: false } as const;
  return (
    <figure aria-label={`${yLabel} versus ${xLabel}`} className="-mx-1">
      <ResponsiveContainer width="100%" height={200}>
        <ScatterChart margin={{ top: 6, right: 6, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={t.line} strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" name={xLabel} {...axis} domain={["auto", "auto"]} label={{ value: xLabel, position: "insideBottom", offset: -8, fill: t.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={yLabel} {...axis} width={36} domain={["auto", "auto"]} />
          <ZAxis range={[36, 36]} />
          <Tooltip cursor={{ stroke: t.line }} contentStyle={{ background: t.surface, border: `1px solid ${t.line}`, color: t.ink, fontSize: 12, borderRadius: 8 }} />
          <Scatter data={points} fill={t.chart2} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </figure>
  );
}

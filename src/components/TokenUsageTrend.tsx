import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import type { DailyUsage } from "@/lib/api";

interface TokenUsageTrendProps {
  days: DailyUsage[];
}

// Simple number formatters
const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n);

/**
 * A lightweight multi-series line/area chart implemented with SVG and basic UI primitives.
 * - Left axis: Tokens (input/output/cache write/cache read)
 * - Right axis: Cost (USD) and Requests count (normalized to its own max)
 * - Tooltip closely matches the screenshot content
 */
export const TokenUsageTrend: React.FC<TokenUsageTrendProps> = ({ days }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { labels, series, maxTokens, maxCost, maxReq } = useMemo(() => {
    const sorted = days.slice().reverse(); // chronological left->right
    const labels = sorted.map((d) =>
      new Date(d.date.replace(/-/g, "/")).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
    );
    const series = {
      input: sorted.map((d) => d.input_tokens || 0),
      output: sorted.map((d) => d.output_tokens || 0),
      cacheW: sorted.map((d) => d.cache_creation_tokens || 0),
      cacheR: sorted.map((d) => d.cache_read_tokens || 0),
      cost: sorted.map((d) => d.total_cost || 0),
      reqs: sorted.map((d) => d.request_count || 0),
      sumTokens: sorted.map(
        (d) => (d.input_tokens || 0) + (d.output_tokens || 0) + (d.cache_creation_tokens || 0) + (d.cache_read_tokens || 0)
      ),
    } as const;
    const maxTokens = Math.max(1, ...series.sumTokens, ...series.input, ...series.output, ...series.cacheW, ...series.cacheR);
    const maxCost = Math.max(1, ...series.cost);
    const maxReq = Math.max(1, ...series.reqs);
    return { labels, series, maxTokens, maxCost, maxReq };
  }, [days]);

  const width = 900;
  const height = 260;
  const padL = 56; // room for left ticks
  const padR = 56; // room for right ticks
  const padT = 16;
  const padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const n = labels.length;
  const x = (i: number) => padL + (plotW * i) / Math.max(1, n - 1);
  const yToken = (v: number) => padT + plotH * (1 - v / maxTokens);
  const yCost = (v: number) => padT + plotH * (1 - v / maxCost);
  const yReq = (v: number) => padT + plotH * (1 - v / maxReq);

  const pathFrom = (vals: number[], y: (v: number) => number) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");

  const colors = {
    input: "#3b82f6", // blue-500
    output: "#ec4899", // pink-500
    cacheW: "#60a5fa", // blue-400
    cacheR: "#a78bfa", // violet-400
    cost: "#22c55e", // green-500
    req: "#16a34a", // green-600
    grid: "var(--border)",
    text: "var(--muted-foreground)",
  } as const;

  const hovered = hoverIndex != null ? hoverIndex : null;

  const renderTooltip = () => {
    if (hovered == null) return null;
    const dateText = new Date(days.slice().reverse()[hovered].date.replace(/-/g, "/")).toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    });
    const d = days.slice().reverse()[hovered];
    return (
      <div className="absolute -translate-x-1/2 bottom-full mb-2 left-1/2 pointer-events-none">
        <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-xs whitespace-nowrap">
          <div className="text-sm font-semibold mb-1">{dateText}</div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.cost }} />
              费用（USD）：{fmtUSD(d.total_cost)}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.cacheR }} />
              缓存读取Token: {fmtTokens(d.cache_read_tokens || 0)} tokens
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.cacheW }} />
              缓存创建Token: {fmtTokens(d.cache_creation_tokens || 0)} tokens
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.output }} />
              输出Token: {fmtTokens(d.output_tokens || 0)} tokens
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.input }} />
              输入Token: {fmtTokens(d.input_tokens || 0)} tokens
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.req }} />
              请求数：{d.request_count || 0} 次
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6">
      <h3 className="text-sm font-semibold mb-4">Token使用趋势</h3>
      <div className="relative w-full overflow-x-auto">
        <svg width={width} height={height} className="min-w-[900px]">
          {/* axes */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={colors.grid} />
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={colors.grid} />
          {/* left ticks (tokens) 0, 25%, 50%, 75%, 100% */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <text x={8} y={padT + plotH * (1 - t)} className="text-[10px]" fill={colors.text}>
                {fmtTokens(Math.round(maxTokens * t))}
              </text>
              <line
                x1={padL}
                y1={padT + plotH * (1 - t)}
                x2={padL + plotW}
                y2={padT + plotH * (1 - t)}
                stroke={colors.grid}
                strokeDasharray="2,4"
              />
            </g>
          ))}
          {/* right ticks (cost/requests) */}
          {[0, 0.5, 1].map((t) => (
            <g key={`r-${t}`}>
              <text x={padL + plotW + 4} y={padT + plotH * (1 - t)} className="text-[10px]" fill={colors.text}>
                {t === 1 ? fmtUSD(maxCost) : t === 0.5 ? fmtUSD(maxCost / 2) : "$0"}
              </text>
            </g>
          ))}

          {/* token lines */}
          <path d={pathFrom(series.input, yToken)} fill="none" stroke={colors.input} strokeWidth={2} />
          <path d={pathFrom(series.output, yToken)} fill="none" stroke={colors.output} strokeWidth={2} />
          <path d={pathFrom(series.cacheW, yToken)} fill="none" stroke={colors.cacheW} strokeWidth={2} />
          <path d={pathFrom(series.cacheR, yToken)} fill="none" stroke={colors.cacheR} strokeWidth={2} />

          {/* cost line (right axis) */}
          <path d={pathFrom(series.cost, yCost)} fill="none" stroke={colors.cost} strokeWidth={2} />

          {/* requests as small circles on right scale */}
          {series.reqs.map((v, i) => (
            <circle key={`req-${i}`} cx={x(i)} cy={yReq(v)} r={2.5} fill={colors.req} />
          ))}

          {/* x labels and hover hit-areas */}
          {labels.map((lab, i) => (
            <g key={i}
               onMouseEnter={() => setHoverIndex(i)}
               onMouseLeave={() => setHoverIndex(null)}>
              <text
                x={x(i)}
                y={padT + plotH + 16}
                textAnchor="middle"
                className="text-[10px]"
                fill={colors.text}
              >
                {lab}
              </text>
              {/* vertical hover guide */}
              {hoverIndex === i && (
                <line x1={x(i)} y1={padT} x2={x(i)} y2={padT + plotH} stroke={colors.grid} />
              )}
              {/* invisible hit area */}
              <rect x={x(i) - plotW / Math.max(1, n - 1) / 2}
                    y={padT}
                    width={plotW / Math.max(1, n - 1)}
                    height={plotH}
                    fill="transparent" />
            </g>
          ))}
        </svg>
        {/* Tooltip container */}
        {hoverIndex != null && (
          <div
            className="absolute"
            style={{ left: `${((padL + (plotW * hoverIndex) / Math.max(1, n - 1)) / width) * 100}%`, bottom: padB + 8 }}
          >
            {renderTooltip()}
          </div>
        )}
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: colors.input }} />输入Token</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: colors.output }} />输出Token</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: colors.cacheW }} />缓存创建Token</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: colors.cacheR }} />缓存读取Token</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: colors.cost }} />费用（USD）</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: colors.req }} />请求数</div>
      </div>
    </Card>
  );
};


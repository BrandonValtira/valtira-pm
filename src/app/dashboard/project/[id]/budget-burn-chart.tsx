"use client";

import type { BudgetBurnChartPoint } from "@/lib/budget-burn-chart";
import { formatDateOnly } from "@/lib/report-week";

type Props = {
  points: BudgetBurnChartPoint[];
  totalBudgetHours: number;
  contractStart: string;
  contractEnd: string;
};

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 12, right: 16, bottom: 28, left: 44 };

export function BudgetBurnLineChart({
  points,
  totalBudgetHours,
  contractStart,
  contractEnd,
}: Props) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-neutral-600">Not enough data to chart budget burn yet.</p>
    );
  }

  const actualPoints = points.filter((p) => p.actualCumulative != null);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const maxY = Math.max(
    totalBudgetHours,
    ...points.map((p) => p.targetCumulative),
    ...actualPoints.map((p) => p.actualCumulative ?? 0),
    1
  );

  const xAt = (index: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const yAt = (value: number) => PAD.top + plotH - (value / maxY) * plotH;

  const targetPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.targetCumulative).toFixed(1)}`)
    .join(" ");

  const actualPath =
    actualPoints.length > 0
      ? actualPoints
          .map((p, idx) => {
            const i = points.indexOf(p);
            return `${idx === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.actualCumulative!).toFixed(1)}`;
          })
          .join(" ")
      : "";

  const yTicks = [0, maxY * 0.5, maxY];
  const labelIndices = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full max-w-full"
        role="img"
        aria-label="Cumulative budget burn chart"
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={yAt(tick)}
              x2={WIDTH - PAD.right}
              y2={yAt(tick)}
              stroke="#e5e5e5"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yAt(tick) + 4}
              textAnchor="end"
              className="fill-neutral-500 text-[10px]"
            >
              {tick >= 100 ? Math.round(tick) : tick.toFixed(0)}
            </text>
          </g>
        ))}

        <path d={targetPath} fill="none" stroke="#a3a3a3" strokeWidth={2} strokeDasharray="5 4" />
        {actualPath && (
          <path d={actualPath} fill="none" stroke="#171717" strokeWidth={2.5} />
        )}

        {actualPoints.map((p) => {
          const i = points.indexOf(p);
          return (
            <circle
              key={p.weekEnd}
              cx={xAt(i)}
              cy={yAt(p.actualCumulative!)}
              r={3}
              fill="#171717"
            />
          );
        })}

        {labelIndices.map((i) => (
          <text
            key={points[i].weekEnd}
            x={xAt(i)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-neutral-600 text-[10px]"
          >
            {formatDateOnly(points[i].weekEnd).replace(/, \d{4}$/, "")}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-700">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-neutral-900" />
          Actual burn (through today)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-neutral-400" />
          Target pace (full contract)
        </span>
        <span className="text-neutral-500">
          {formatDateOnly(contractStart)} – {formatDateOnly(contractEnd)}
        </span>
      </div>
    </div>
  );
}

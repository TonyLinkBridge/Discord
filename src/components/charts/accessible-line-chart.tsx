"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "@/features/overview/overview-screen.module.css";

export interface AccessibleLinePoint {
  date: string;
  value: number;
}

const dateParts = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return {
    date: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(value),
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
    }).format(value),
  };
};

const dayLabel = (date: string) => {
  const parts = dateParts(date);
  return `${parts.weekday}, ${parts.date}`;
};

function DateAxisTick({
  payload,
  x = 0,
  y = 0,
}: Readonly<{
  payload?: { value: string };
  x?: number;
  y?: number;
}>) {
  if (!payload) return null;
  const parts = dateParts(payload.value);

  return (
    <g transform={`translate(${x},${y})`}>
      <text fill="var(--text-secondary)" fontSize={10} textAnchor="middle">
        <tspan x="0" dy="1em">{parts.date}</tspan>
        <tspan x="0" dy="1.45em">{parts.weekday}</tspan>
      </text>
    </g>
  );
}

export function AccessibleLineChart({
  data,
  label,
  rangeLabel,
}: Readonly<{
  data: AccessibleLinePoint[];
  label: string;
  rangeLabel: string;
}>) {
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const gradientId = `overview-${label.toLocaleLowerCase()}-gradient`;

  return (
    <>
      <div aria-label={`${label} line chart for ${rangeLabel}`} className={styles.chartRegion} role="img">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data} margin={{ bottom: 0, left: -22, right: 20, top: 22 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.34} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 4" vertical={false} />
            <XAxis
              axisLine={{ stroke: "var(--border-subtle)" }}
              dataKey="date"
              height={48}
              interval={0}
              tick={<DateAxisTick />}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              domain={[0, 100]}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false}
              ticks={[0, 20, 40, 60, 80, 100]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 11,
              }}
              labelFormatter={(date) => dayLabel(String(date))}
            />
            <Area
              activeDot={{ fill: "var(--bg-panel)", r: 4, stroke: "var(--chart-1)", strokeWidth: 2 }}
              dataKey="value"
              dot={{ fill: "var(--bg-panel)", r: 3, stroke: "var(--chart-1)", strokeWidth: 2 }}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              stroke="var(--chart-1)"
              strokeWidth={2}
              type="linear"
            >
              <LabelList
                dataKey="value"
                fill="var(--text-primary)"
                fontSize={11}
                offset={9}
                position="top"
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className={styles.visuallyHidden}>
        <caption>{label} data table</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">{label}</th></tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}><th scope="row">{dayLabel(point.date)}</th><td>{point.value}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><th scope="row">Total</th><td>{total}</td></tr></tfoot>
      </table>
    </>
  );
}

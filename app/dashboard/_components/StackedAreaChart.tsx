'use client';

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  data: Record<string, string | number>[];
  keys: string[];
  mode?: 'percent' | 'absolute';
};

const palette = ['#0ea5e9', '#22c55e', '#f59e0b', '#6366f1', '#ec4899', '#a855f7', '#14b8a6', '#94a3b8'];

export default function StackedAreaChart({ data, keys, mode = 'percent' }: Props) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} stackOffset={mode === 'percent' ? 'expand' : 'none'}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={12} />
          {mode === 'percent' ? (
            <>
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} />
              <Tooltip
                formatter={(value: number, name, props) => {
                  const total = keys.reduce((sum, k) => sum + (props.payload?.[k] ?? 0), 0);
                  const pct = total ? ((value as number) / total) * 100 : 0;
                  return [`${pct.toFixed(1)}%`, name];
                }}
                labelFormatter={(label) => `Month: ${label}`}
              />
            </>
          ) : (
            <>
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip
                formatter={(value: number, name) => [Number(value).toLocaleString(), name]}
                labelFormatter={(label) => `Month: ${label}`}
              />
            </>
          )}
          <Legend />
          {keys.map((key, idx) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="1"
              stroke={palette[idx % palette.length]}
              fill={palette[idx % palette.length]}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

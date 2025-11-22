'use client';

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid } from 'recharts';

type SharePoint = { label: string; [key: string]: string | number };

const colors = ['#0ea5e9', '#22c55e', '#f59e0b', '#6366f1', '#ec4899', '#a855f7', '#14b8a6', '#94a3b8'];

export default function OperatorShareChart({ data, keys }: { data: SharePoint[]; keys: string[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} stackOffset="expand">
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip
            formatter={(value: number, name, props) => {
              const total = keys.reduce((sum, k) => sum + (props.payload?.[k] ?? 0), 0);
              const pct = total ? ((value as number) / total) * 100 : 0;
              return [`${pct.toFixed(1)}%`, name];
            }}
            labelFormatter={(label) => `Month: ${label}`}
          />
          <Legend />
          {keys.map((key, idx) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="1"
              stroke={colors[idx % colors.length]}
              fill={colors[idx % colors.length]}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

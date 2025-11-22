'use client';

import { Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type TrendPoint = { label: string; [key: string]: string | number };

const colors = ['#0ea5e9', '#22c55e', '#f59e0b', '#6366f1', '#ec4899', '#a855f7', '#14b8a6', '#94a3b8'];

export default function OperatorTrendChart({ data, keys }: { data: TrendPoint[]; keys: string[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
          <Tooltip formatter={(v: number) => v.toLocaleString()} labelFormatter={(l) => `Month: ${l}`} />
          <Legend />
          {keys.map((k, idx) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[idx % colors.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

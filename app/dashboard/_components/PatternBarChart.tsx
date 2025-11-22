'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  data: { corridor: string; weekend_index?: number | null }[];
};

export default function PatternBarChart({ data }: Props) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="corridor" tick={{ fontSize: 11 }} minTickGap={12} />
          <YAxis tickFormatter={(v) => `${v.toFixed(1)}x`} />
          <Tooltip formatter={(v: number) => `${v.toFixed(2)}x`} labelFormatter={(l) => `Corridor: ${l}`} />
          <Bar dataKey="weekend_index" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

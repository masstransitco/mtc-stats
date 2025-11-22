'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Row = { name: string; value: number };

export default function OperatorRankingBar({ rows }: { rows: Row[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip formatter={(v: number) => v.toLocaleString()} />
          <Bar dataKey="value" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

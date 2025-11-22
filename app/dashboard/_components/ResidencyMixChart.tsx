'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  data: { label: string; hk_share: number; mainland_share: number; other_share: number }[];
};

export default function ResidencyMixChart({ data }: Props) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip formatter={(val: number) => `${(val * 100).toFixed(1)}%`} labelFormatter={(l) => `Month: ${l}`} />
          <Legend />
          <Line type="monotone" dataKey="hk_share" stroke="#0ea5e9" strokeWidth={2} dot={false} name="HK" />
          <Line type="monotone" dataKey="mainland_share" stroke="#22c55e" strokeWidth={2} dot={false} name="Mainland" />
          <Line type="monotone" dataKey="other_share" stroke="#f59e0b" strokeWidth={2} dot={false} name="Other" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

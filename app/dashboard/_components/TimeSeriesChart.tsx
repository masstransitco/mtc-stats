'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = { data: { date: string; total_passengers: number; rolling_7d_avg?: number | null }[] };

export default function TimeSeriesChart({ data }: Props) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(val: number) => val.toLocaleString()} labelFormatter={(label) => `Date: ${label}`} />
          <Line type="monotone" dataKey="total_passengers" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Total" />
          <Line
            type="monotone"
            dataKey="rolling_7d_avg"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            name="7d avg"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

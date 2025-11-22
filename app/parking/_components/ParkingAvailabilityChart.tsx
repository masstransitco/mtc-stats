'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Row = { district: string; vehicle_type: string; vacant_spaces: number; parks?: number };

export default function ParkingAvailabilityChart({ data }: { data: Row[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 40 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="district" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 100)}00`} />
          <Tooltip formatter={(v: number) => v.toLocaleString()} />
          <Legend />
          <Bar dataKey="vacant_spaces" name="Vacant" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

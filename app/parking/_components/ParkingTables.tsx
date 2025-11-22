type LatestRow = {
  park_id: string;
  name?: string | null;
  district?: string | null;
  vehicle_type?: string | null;
  vacancy?: number | null;
  vacancy_dis?: number | null;
  vacancy_ev?: number | null;
  vacancy_unl?: number | null;
  lastupdate?: string | null;
};

export function ParkingLatestTable({ rows }: { rows: LatestRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Park</th>
            <th className="py-1">District</th>
            <th className="py-1">Vehicle</th>
            <th className="py-1 text-right">Vacant</th>
            <th className="py-1 text-right">EV</th>
            <th className="py-1 text-right">Disabled</th>
            <th className="py-1 text-right">Unload</th>
            <th className="py-1">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.park_id}-${row.vehicle_type ?? ''}`} className="border-t border-slate-100">
              <td className="py-1">{row.name ?? row.park_id}</td>
              <td className="py-1">{row.district ?? '—'}</td>
              <td className="py-1">{row.vehicle_type ?? '—'}</td>
              <td className="py-1 text-right">{row.vacancy?.toLocaleString() ?? '—'}</td>
              <td className="py-1 text-right">{row.vacancy_ev?.toLocaleString() ?? '—'}</td>
              <td className="py-1 text-right">{row.vacancy_dis?.toLocaleString() ?? '—'}</td>
              <td className="py-1 text-right">{row.vacancy_unl?.toLocaleString() ?? '—'}</td>
              <td className="py-1">{row.lastupdate?.split('T')[0] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

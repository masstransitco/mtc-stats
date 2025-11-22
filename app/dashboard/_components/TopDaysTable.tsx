type Props = {
  rows: {
    id?: string;
    date: string;
    total_passengers: number;
    top_control_point_name?: string | null;
    top_control_point_share?: number | null;
    holiday_period?: string | null;
  }[];
};

export default function TopDaysTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Date</th>
            <th className="py-1 text-right">Passengers</th>
            <th className="py-1">Top control point</th>
            <th className="py-1 text-right">Share</th>
            <th className="py-1">Holiday</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id ?? `${row.date}-${row.top_control_point_name ?? ''}-${row.total_passengers}`}
              className="border-t border-slate-100"
            >
              <td className="py-1">{row.date}</td>
              <td className="py-1 text-right">{row.total_passengers?.toLocaleString()}</td>
              <td className="py-1">{row.top_control_point_name ?? '—'}</td>
              <td className="py-1 text-right">
                {row.top_control_point_share != null ? `${(row.top_control_point_share * 100).toFixed(1)}%` : '—'}
              </td>
              <td className="py-1">{row.holiday_period ?? 'NONE'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

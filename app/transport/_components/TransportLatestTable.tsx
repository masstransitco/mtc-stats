type Row = {
  id: string;
  year_month: number;
  mode: string;
  operator_code?: string | null;
  rail_line?: string | null;
  avg_daily_pax?: number | null;
};

function formatYearMonth(ym: number) {
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export default function TransportLatestTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Month</th>
            <th className="py-1">Mode / Operator / Line</th>
            <th className="py-1 text-right">Avg daily pax (M)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="py-1">{formatYearMonth(row.year_month)}</td>
              <td className="py-1">
                {[row.mode, row.operator_code, row.rail_line].filter(Boolean).join(' / ')}
              </td>
              <td className="py-1 text-right">
                {row.avg_daily_pax != null ? (Number(row.avg_daily_pax) / 1_000).toFixed(2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

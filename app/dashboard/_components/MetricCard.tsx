type Props = {
  label: string;
  value: string;
  sub?: string;
};

export default function MetricCard({ label, value, sub }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

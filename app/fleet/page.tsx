import React from 'react';
import { getVehicleStateSummary, getDwellHotspots, getRecentDwells, getHourlyActivity24h } from '@/lib/db';

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs >= 1) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

function formatTimeRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })} → ${e.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}`;
}

export default async function FleetPage() {
  const [stateSummary, hotspots, recentDwells, hourlyActivity] = await Promise.all([
    getVehicleStateSummary(),
    getDwellHotspots(8),
    getRecentDwells(25),
    getHourlyActivity24h()
  ]);

  const totalHours = stateSummary.reduce((acc, row) => acc + row.total_duration_sec, 0) / 3600;

  const palette = {
    charging: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700',
    moving: 'from-sky-500/15 to-sky-500/5 text-sky-700',
    ignition_on_idle: 'from-amber-500/15 to-amber-500/5 text-amber-700',
    ignition_off_idle: 'from-slate-500/15 to-slate-500/5 text-slate-700',
    default: 'from-slate-500/10 to-slate-500/5 text-slate-700'
  };

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-white shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.08),transparent_28%)]" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">MTC Fleet</p>
            <h1 className="text-3xl font-semibold">Live vehicle behaviour and stops</h1>
            <p className="mt-2 max-w-2xl text-slate-200">
              Segmented states, deliberate dwells, and the districts they occur in — refreshed every 15 minutes.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-right shadow-lg backdrop-blur">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-200">Time analysed</p>
            <p className="text-2xl font-semibold">{totalHours.toFixed(1)} hrs</p>
            <p className="text-xs text-slate-200">across all MG vehicles</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {stateSummary.map((row) => {
          const key = row.state?.replace(/ /g, '_') || 'default';
          const style = (palette as Record<string, string>)[key] || palette.default;
          return (
            <div
              key={row.state}
              className={`overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br ${style} shadow-sm`}
            >
              <div className="p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-600">State</p>
                <h3 className="text-lg font-semibold text-slate-900">{row.state}</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {(row.total_duration_sec / 3600).toFixed(1)}h
                </p>
                <p className="text-sm text-slate-700">{row.count} segments</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm h-[520px] flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">District dwell hotspots</p>
              <h2 className="text-lg font-semibold text-slate-900">Where vehicles linger the longest</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Top {hotspots.length}</span>
          </div>
          <div className="mt-4 space-y-3 overflow-y-auto">
            {hotspots.map((row, idx) => (
              <div
                key={`${row.district}-${idx}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{row.district}</p>
                    <p className="text-xs text-slate-500">{row.events} dwells</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-900">{row.dwell_minutes.toFixed(1)} min</p>
                  <p className="text-xs text-slate-500">total dwell time</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm h-[520px] flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Most recent dwells</p>
              <h2 className="text-lg font-semibold text-slate-900">Stops ≥ 5 minutes, radius ≤ 60 m</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {recentDwells.length} events
            </span>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 flex-1">
            <div className="h-full overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                    <th className="px-4 py-2">VIN</th>
                    <th className="px-4 py-2">District</th>
                    <th className="px-4 py-2">Duration</th>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">Radius</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentDwells.map((dw) => (
                    <tr key={`${dw.vin}-${dw.start_ts}`}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-900">{dw.vin}</td>
                      <td className="px-4 py-2 text-slate-800">{dw.district ?? 'Unknown'}</td>
                      <td className="px-4 py-2 text-slate-800">{formatDuration(dw.duration_sec)}</td>
                      <td className="px-4 py-2 text-slate-600">{formatTimeRange(dw.start_ts, dw.end_ts)}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {dw.radius_m ? `${dw.radius_m.toFixed(0)} m` : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">24h activity heatmap</p>
            <h2 className="text-lg font-semibold text-slate-900">Hourly activity by vehicle (HK time)</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Last 24 hours</span>
        </div>
        <ActivityGrid activity={hourlyActivity} />
      </section>
    </div>
  );
}

function ActivityGrid({ activity }: { activity: Awaited<ReturnType<typeof getHourlyActivity24h>> }) {
  const byVin = new Map<string, number[]>();
  for (const row of activity) {
    const arr = byVin.get(row.vin) ?? Array(24).fill(0);
    arr[row.hour] += row.duration_min;
    byVin.set(row.vin, arr);
  }
  const vins = Array.from(byVin.keys()).sort();
  const maxVal = Math.max(1, ...Array.from(byVin.values()).flat());
  const colorFor = (v: number) => {
    const t = Math.min(1, v / maxVal);
    const start = [226, 232, 240];
    const mid = [96, 165, 250];
    const end = [59, 130, 246];
    const mix = (a: number[], b: number[], m: number) =>
      a.map((x, i) => Math.round(x + (b[i] - x) * m));
    const rgb = mix(start, mix(mid, end, t), t);
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[140px_repeat(24,minmax(28px,1fr))] text-xs">
        <div className="sticky left-0 z-10 bg-white/90 px-2 py-1 text-slate-500">Vehicle / Hour</div>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="px-2 py-1 text-center text-slate-500">
            {h}
          </div>
        ))}
        {vins.map((vin) => {
          const arr = byVin.get(vin)!;
          return (
            <React.Fragment key={vin}>
              <div className="sticky left-0 z-10 bg-white/90 px-2 py-2 font-mono text-[11px] text-slate-800">
                {vin}
              </div>
              {arr.map((v, idx) => (
                <div
                  key={`${vin}-${idx}`}
                  className="h-10 border border-slate-100"
                  style={{ backgroundColor: colorFor(v) }}
                  title={`${vin} @ ${idx}:00 — ${(v).toFixed(1)} min`}
                />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

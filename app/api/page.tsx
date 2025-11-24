import Link from 'next/link';

const endpoints = [
  {
    path: '/api/metered/carparks',
    description: 'List metered carparks with coordinates and total spaces',
    params: [
      { name: 'district', desc: 'Filter by district (exact match)' },
      { name: 'limit', desc: 'Max rows (default 50, max 200)' },
      { name: 'offset', desc: 'Pagination offset (default 0)' }
    ]
  },
  {
    path: '/api/metered/recommendations',
    description: 'Rank metered carparks most likely to have availability now (hour-of-day pattern based)',
    params: [
      { name: 'district', desc: 'Optional district filter' },
      { name: 'limit', desc: 'Max rows (default 20, max 100)' }
    ]
  },
  {
    path: '/api/metered/trends',
    description: '5-minute vacancy-rate trend for metered parking (last 24h)',
    params: [
      { name: 'district', desc: 'Optional district filter' },
      { name: 'vehicle_type', desc: 'Optional vehicle type filter' }
    ]
  },
  {
    path: '/api/metered/districts/busiest',
    description: 'District-level volatility (stddev vacancy rate, last 24h)',
    params: []
  }
];

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">API: Metered Parking</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Real-time and pattern-based endpoints surfaced from our processed metered parking datasets. All
          endpoints return JSON. Timestamps are ISO-8601.
        </p>
      </header>

      <section className="space-y-4">
        {endpoints.map((ep) => (
          <div key={ep.path} className="rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{ep.path}</p>
                <p className="text-sm text-slate-600">{ep.description}</p>
              </div>
              <Link href={ep.path} className="text-sm font-medium text-blue-600 hover:underline">
                Try it →
              </Link>
            </div>
            {ep.params.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Query Params</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {ep.params.map((p) => (
                    <li key={p.name}>
                      <span className="font-mono text-xs text-slate-900">{p.name}</span> — {p.desc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-800">
              <p className="font-semibold text-slate-900">Example</p>
              <p className="mt-1 font-mono text-[11px]">
                {`${ep.path}${ep.params.length ? `?${ep.params.slice(0, 1).map((p) => `${p.name}=...`).join('&')}` : ''}`}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Data Notes</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-semibold">Freshness:</span> Backed by materialized views refreshed by the parking
            cron (`app/api/cron/refresh-parking/route.ts`). Recommendations use current HK hour patterns until live
            per-carpark snapshots are exposed.
          </li>
          <li>
            <span className="font-semibold">Coverage:</span> Metered parking only; regular carparks are available
            through the existing `/parking` visualizations and can be added here if needed.
          </li>
          <li>
            <span className="font-semibold">Limits:</span> Results are capped to avoid Supabase row limits; paginate
            where supported.
          </li>
        </ul>
      </section>
    </div>
  );
}

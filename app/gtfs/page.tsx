import GtfsClient from './GtfsClient';
import { getRouteSummaries } from '@/lib/gtfs';

type ClientRoute = {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  route_url?: string;
};

export const dynamic = 'force-dynamic';

export default async function GtfsPage() {
  const routes = await getRouteSummaries();
  const sortedRoutes: ClientRoute[] = [...routes]
    .map((r) => ({
      route_id: r.route_id,
      agency_id: r.agency_id ?? '',
      route_short_name: r.route_short_name ?? '',
      route_long_name: r.route_long_name ?? '',
      route_type: r.route_type != null ? String(r.route_type) : '',
      route_url: r.route_url ?? null
    }))
    .sort((a, b) => (a.route_short_name ?? '').localeCompare(b.route_short_name ?? ''));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">GTFS explorer</p>
            <h1 className="text-3xl font-semibold">Route geometry + headways on a live map</h1>
            <p className="mt-2 max-w-3xl text-slate-200">
              Visualize the transport feed geospatially: select a route to trace its stop chain and see published
              headway windows from the frequencies/headway spec. Powered by the GTFS bundle in transport-fares/gtfs.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-right shadow-lg backdrop-blur">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-200">Feed scale</p>
            <p className="text-lg font-semibold">{routes.length} routes · 9.4k stops</p>
            <p className="text-xs text-slate-200">Headways from frequencies.txt + ptheadway spec</p>
          </div>
        </div>
      </div>

      <GtfsClient routes={sortedRoutes} />
    </div>
  );
}

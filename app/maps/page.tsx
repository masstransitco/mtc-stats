import HeatmapClient from './HeatmapClient';
import { getCarparkHourlyData, getMeteredCarparkHourlyData, getDwellHeatPoints, getRecentMovements24h } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function MapsPage() {
  const [carparkHourly, meteredHourly, dwells, movements] = await Promise.all([
    getCarparkHourlyData(40), // Top 40 carparks with hourly data
    getMeteredCarparkHourlyData(40), // Top 40 metered carparks with hourly data
    getDwellHeatPoints(14),
    getRecentMovements24h()
  ]);

  const carparkPoints = carparkHourly.filter((p) => p.lat && p.lon);
  const meteredPoints = meteredHourly.filter((p) => p.lat && p.lon);
  const dwellPoints = dwells.filter((p) => p.lat && p.lon);
  const movementPoints = movements.filter((p) => p.lat && p.lon);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Geospatial pulse</p>
            <h1 className="text-3xl font-semibold">
              Live heat: carpark throughput vs trips
            </h1>
            <p className="mt-2 max-w-3xl text-slate-200">
              Time-based visualizations with progressive rendering. Watch 5 MG vehicles traverse Hong Kong with smooth
              animations, or explore hourly carpark patterns—toggle between volatility and occupancy heat across 24 hours.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-right shadow-lg backdrop-blur">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-200">Data windows</p>
            <p className="text-lg font-semibold">Parking: 40 + 40 × 24h</p>
            <p className="text-xs text-slate-200">Vehicles: 5 × 24h realtime</p>
          </div>
        </div>
      </div>

      <HeatmapClient
        carparkPoints={carparkPoints}
        meteredPoints={meteredPoints}
        dwellPoints={dwellPoints}
        movementPoints={movementPoints}
      />
    </div>
  );
}

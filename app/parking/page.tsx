import { Suspense } from 'react';
import {
  getParking5MinTrend,
  getParkingHourlyPattern,
  getMetered5MinTrend,
  getMeteredHourlyPattern,
  getBusiestDistrictsParking,
  getBusiestDistrictsMetered,
  getBusiestCarparks
} from '@/lib/db';
import ParkingPatternCharts from './_components/ParkingPatternCharts';

export default async function ParkingPage() {
  const [
    parking5min,
    parkingHourly,
    metered5min,
    meteredHourly,
    busiestDistrictsParking,
    busiestDistrictsMetered,
    busiestCarparks
  ] = await Promise.all([
    getParking5MinTrend(),
    getParkingHourlyPattern(),
    getMetered5MinTrend(),
    getMeteredHourlyPattern(),
    getBusiestDistrictsParking(),
    getBusiestDistrictsMetered(),
    getBusiestCarparks(20)
  ]);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Parking Occupancy Patterns</h1>
        <p className="mt-1 text-sm text-slate-600">
          Analyzing carpark occupancy changes throughout 24 hours with 5-minute intervals
        </p>
      </div>

      <Suspense fallback={<div>Loading patterns...</div>}>
        <ParkingPatternCharts
          parking5min={parking5min}
          parkingHourly={parkingHourly}
          metered5min={metered5min}
          meteredHourly={meteredHourly}
          busiestDistrictsParking={busiestDistrictsParking}
          busiestDistrictsMetered={busiestDistrictsMetered}
          busiestCarparks={busiestCarparks}
        />
      </Suspense>
    </div>
  );
}

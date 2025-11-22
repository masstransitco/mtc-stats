'use client';

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

type Props = {
  parking5min: any[];
  parkingHourly: any[];
  metered5min: any[];
  meteredHourly: any[];
  busiestDistrictsParking: any[];
  busiestDistrictsMetered: any[];
  busiestCarparks: any[];
};

// Color palette for districts
const DISTRICT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#f43f5e', '#a855f7', '#0ea5e9', '#22c55e',
  '#eab308', '#d946ef', '#0891b2', '#65a30d', '#6366f1'
];

export default function ParkingPatternCharts({
  parking5min,
  parkingHourly,
  metered5min,
  meteredHourly,
  busiestDistrictsParking,
  busiestDistrictsMetered,
  busiestCarparks
}: Props) {
  // Get top 5 busiest districts for focused comparison
  const topBusiestParking = busiestDistrictsParking.slice(0, 5).map(d => d.district);
  const topBusiestMetered = busiestDistrictsMetered.slice(0, 5).map(d => d.district);

  // State for district selection
  const [selectedParkingDistricts, setSelectedParkingDistricts] = useState<string[]>(topBusiestParking);
  const [selectedMeteredDistricts, setSelectedMeteredDistricts] = useState<string[]>(topBusiestMetered);

  // Get all unique districts
  const allParkingDistricts = Array.from(new Set(parkingHourly.map(d => d.district))).sort();
  const allMeteredDistricts = Array.from(new Set(meteredHourly.map(d => d.district).filter(Boolean))).sort();

  // Aggregate data by district for comparison
  const parking5minByDistrict = aggregateBy5MinDistrict(parking5min, selectedParkingDistricts);
  const parkingHourlyByDistrict = aggregateByHourDistrict(parkingHourly, selectedParkingDistricts);
  const metered5minByDistrict = aggregateBy5MinDistrictMetered(metered5min, selectedMeteredDistricts);
  const meteredHourlyByDistrict = aggregateByHourDistrictMetered(meteredHourly, selectedMeteredDistricts);

  return (
    <div className="space-y-8">
      {/* Busiest Districts Analysis */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Busiest Districts (Most Changes in Occupancy)</h2>
        <p className="mb-4 text-sm text-slate-600">
          Districts ranked by standard deviation in occupancy over the last 24 hours
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-700">Regular Carparks</h3>
            <div className="space-y-2">
              {busiestDistrictsParking.slice(0, 10).map((district, idx) => (
                <div key={district.district} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-500">#{idx + 1}</span>
                    <span className="text-sm font-medium text-slate-900">{district.district}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-blue-700">
                      σ = {Number(district.stddev_vacancy || 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Range: {district.min_vacancy}-{district.max_vacancy}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-700">Metered Carparks</h3>
            <div className="space-y-2">
              {busiestDistrictsMetered.slice(0, 10).map((district, idx) => (
                <div key={district.district} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-500">#{idx + 1}</span>
                    <span className="text-sm font-medium text-slate-900">{district.district}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-green-700">
                      σ = {Number(district.stddev_vacancy_rate || 0).toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-500">
                      Range: {Number(district.min_vacancy_rate || 0).toFixed(1)}%-{Number(district.max_vacancy_rate || 0).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Busiest Individual Carparks */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Busiest Individual Carparks</h2>
        <p className="mb-4 text-sm text-slate-600">
          Top 20 carparks with the most occupancy fluctuation (24 hours)
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="p-2 text-left font-medium text-slate-700">Rank</th>
                <th className="p-2 text-left font-medium text-slate-700">Carpark Name</th>
                <th className="p-2 text-left font-medium text-slate-700">District</th>
                <th className="p-2 text-right font-medium text-slate-700">Avg Vacancy</th>
                <th className="p-2 text-right font-medium text-slate-700">Range</th>
                <th className="p-2 text-right font-medium text-slate-700">Std Dev</th>
              </tr>
            </thead>
            <tbody>
              {busiestCarparks.map((carpark, idx) => (
                <tr key={carpark.park_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-bold text-slate-500">{idx + 1}</td>
                  <td className="p-2 text-slate-900">{carpark.park_name}</td>
                  <td className="p-2 text-slate-600">{carpark.district}</td>
                  <td className="p-2 text-right text-slate-900">{Number(carpark.avg_vacancy || 0).toFixed(0)}</td>
                  <td className="p-2 text-right text-slate-600">
                    {carpark.min_vacancy}-{carpark.max_vacancy}
                  </td>
                  <td className="p-2 text-right font-semibold text-blue-700">
                    {Number(carpark.stddev_vacancy || 0).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* District Comparison - Regular Carparks */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Regular Carparks - District Comparison
        </h2>

        {/* District selector */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Select Districts to Compare (max 5)
          </label>
          <div className="flex flex-wrap gap-2">
            {allParkingDistricts.map((district) => (
              <button
                key={district}
                onClick={() => {
                  if (selectedParkingDistricts.includes(district)) {
                    setSelectedParkingDistricts(selectedParkingDistricts.filter(d => d !== district));
                  } else if (selectedParkingDistricts.length < 5) {
                    setSelectedParkingDistricts([...selectedParkingDistricts, district]);
                  }
                }}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  selectedParkingDistricts.includes(district)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {district}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Hourly Average Vacancy by District</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={parkingHourlyByDistrict}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Vacant Spaces', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                {selectedParkingDistricts.map((district, idx) => (
                  <Line
                    key={district}
                    type="monotone"
                    dataKey={district}
                    stroke={DISTRICT_COLORS[idx % DISTRICT_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={true}
                    name={district}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* District Comparison - Metered Carparks */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Metered Carparks - District Comparison
        </h2>

        {/* District selector */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Select Districts to Compare (max 5)
          </label>
          <div className="flex flex-wrap gap-2">
            {allMeteredDistricts.map((district) => (
              <button
                key={district}
                onClick={() => {
                  if (selectedMeteredDistricts.includes(district)) {
                    setSelectedMeteredDistricts(selectedMeteredDistricts.filter(d => d !== district));
                  } else if (selectedMeteredDistricts.length < 5) {
                    setSelectedMeteredDistricts([...selectedMeteredDistricts, district]);
                  }
                }}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  selectedMeteredDistricts.includes(district)
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {district}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Hourly Vacancy Rate by District (%)</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={meteredHourlyByDistrict}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Vacancy Rate (%)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                {selectedMeteredDistricts.map((district, idx) => (
                  <Line
                    key={district}
                    type="monotone"
                    dataKey={district}
                    stroke={DISTRICT_COLORS[idx % DISTRICT_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={true}
                    name={district}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Summary Stats */}
      <section className="rounded-lg border border-slate-200 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Summary Statistics</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-900">Total Districts (Regular)</div>
            <div className="mt-2 text-2xl font-bold text-blue-700">{allParkingDistricts.length}</div>
            <div className="text-xs text-blue-600">Tracked regions</div>
          </div>

          <div className="rounded-lg bg-green-50 p-4">
            <div className="text-sm font-medium text-green-900">Total Districts (Metered)</div>
            <div className="mt-2 text-2xl font-bold text-green-700">{allMeteredDistricts.length}</div>
            <div className="text-xs text-green-600">Tracked regions</div>
          </div>

          <div className="rounded-lg bg-purple-50 p-4">
            <div className="text-sm font-medium text-purple-900">Busiest District</div>
            <div className="mt-2 text-lg font-bold text-purple-700">
              {busiestDistrictsParking[0]?.district || 'N/A'}
            </div>
            <div className="text-xs text-purple-600">
              σ = {Number(busiestDistrictsParking[0]?.stddev_vacancy || 0).toFixed(1)}
            </div>
          </div>

          <div className="rounded-lg bg-orange-50 p-4">
            <div className="text-sm font-medium text-orange-900">Busiest Carpark</div>
            <div className="mt-2 text-sm font-bold text-orange-700">
              {busiestCarparks[0]?.park_name?.substring(0, 20) || 'N/A'}...
            </div>
            <div className="text-xs text-orange-600">
              {busiestCarparks[0]?.district || 'N/A'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Aggregation helper functions for district-level data
function aggregateBy5MinDistrict(data: any[], selectedDistricts: string[]) {
  const grouped = new Map<string, any>();

  data.forEach((row) => {
    if (!selectedDistricts.includes(row.district)) return;

    const time = new Date(row.time_bucket).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (!grouped.has(time)) {
      grouped.set(time, { time });
    }

    const existing = grouped.get(time)!;
    existing[row.district] = Number(row.avg_vacancy || 0);
  });

  return Array.from(grouped.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function aggregateByHourDistrict(data: any[], selectedDistricts: string[]) {
  const grouped = new Map<number, any>();

  // Initialize all 24 hours (0-23) with empty data
  for (let hour = 0; hour < 24; hour++) {
    grouped.set(hour, { hour });
  }

  data.forEach((row) => {
    if (!selectedDistricts.includes(row.district)) return;

    const hour = Number(row.hour_of_day);

    const existing = grouped.get(hour)!;
    if (!existing[row.district]) {
      existing[row.district] = 0;
      existing[`${row.district}_count`] = 0;
    }
    existing[row.district] += Number(row.avg_vacancy || 0);
    existing[`${row.district}_count`] += 1;
  });

  // Average the values
  const result = Array.from(grouped.values()).map(entry => {
    const averaged: any = { hour: entry.hour };
    selectedDistricts.forEach(district => {
      const count = entry[`${district}_count`] || 0;
      averaged[district] = count > 0 ? Number((entry[district] / count).toFixed(2)) : null;
    });
    return averaged;
  });

  return result.sort((a, b) => a.hour - b.hour);
}

function aggregateBy5MinDistrictMetered(data: any[], selectedDistricts: string[]) {
  const grouped = new Map<string, any>();

  data.forEach((row) => {
    if (!selectedDistricts.includes(row.district)) return;

    const time = new Date(row.time_bucket).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (!grouped.has(time)) {
      grouped.set(time, { time });
    }

    const existing = grouped.get(time)!;
    existing[row.district] = Number(row.vacancy_rate || 0);
  });

  return Array.from(grouped.values()).sort((a, b) => a.time.localeCompare(b.time));
}

function aggregateByHourDistrictMetered(data: any[], selectedDistricts: string[]) {
  const grouped = new Map<number, any>();

  // Initialize all 24 hours (0-23) with empty data
  for (let hour = 0; hour < 24; hour++) {
    grouped.set(hour, { hour });
  }

  data.forEach((row) => {
    if (!selectedDistricts.includes(row.district)) return;

    const hour = Number(row.hour_of_day);

    const existing = grouped.get(hour)!;
    if (!existing[row.district]) {
      existing[row.district] = 0;
      existing[`${row.district}_count`] = 0;
    }
    existing[row.district] += Number(row.avg_vacancy_rate || 0);
    existing[`${row.district}_count`] += 1;
  });

  // Average the values
  const result = Array.from(grouped.values()).map(entry => {
    const averaged: any = { hour: entry.hour };
    selectedDistricts.forEach(district => {
      const count = entry[`${district}_count`] || 0;
      averaged[district] = count > 0 ? Number((entry[district] / count).toFixed(2)) : null;
    });
    return averaged;
  });

  return result.sort((a, b) => a.hour - b.hour);
}

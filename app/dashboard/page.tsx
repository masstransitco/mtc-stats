import { Suspense } from 'react';
import MetricCard from './_components/MetricCard';
import PatternBarChart from './_components/PatternBarChart';
import ResidencyMixChart from './_components/ResidencyMixChart';
import StackedAreaChart from './_components/StackedAreaChart';
import TimeSeriesChart from './_components/TimeSeriesChart';
import TopDaysTable from './_components/TopDaysTable';
import {
  getCorridors,
  type DailyHeadline,
  getDailyHeadlineSeries,
  getMonthlyCorridorSeries,
  getPatternByCorridor,
  getResidencyMixSeries,
  getTopDays
} from '@/lib/db';

type SearchParams = Record<string, string | string[] | undefined>;

const yearOptions = [2021, 2022, 2023, 2024, 2025];

function parseYear(value: string | undefined) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseCorridors(value: string | string[] | undefined) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(',');
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

function formatYearMonth(ym: number) {
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function pivotMonthlyCorridor(rows: any[]) {
  const map = new Map<string, Record<string, number | string>>();
  const keys = new Set<string>();
  rows.forEach((row) => {
    const label = formatYearMonth(row.year_month);
    const existing = map.get(label) ?? { label };
    existing[row.corridor] = row.total_passengers ?? 0;
    map.set(label, existing);
    keys.add(row.corridor);
  });
  const data = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
  return { data, keys: Array.from(keys) };
}

function toResidencyMixChart(rows: { year_month: number; hk_share: number; mainland_share: number; other_share: number }[]) {
  return rows.map((row) => ({
    label: formatYearMonth(row.year_month),
    hk_share: row.hk_share,
    mainland_share: row.mainland_share,
    other_share: row.other_share
  }));
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const startYear = parseYear(typeof params.startYear === 'string' ? params.startYear : undefined);
  const endYear = parseYear(typeof params.endYear === 'string' ? params.endYear : undefined);
  const corridorFilter = parseCorridors(params.corridor);

  const [corridors, dailySeries, monthlyCorridor, residencyMix, patternData, topDays] = await Promise.all([
    getCorridors(),
    getDailyHeadlineSeries({
      start: startYear ? `${startYear}-01-01` : undefined,
      end: endYear ? `${endYear}-12-31` : undefined
    }),
    getMonthlyCorridorSeries({ startYear, endYear, corridors: corridorFilter }),
    getResidencyMixSeries({ startYear, endYear, corridors: corridorFilter }),
    getPatternByCorridor({ corridors: corridorFilter }),
    getTopDays(10)
  ]);

  const { data: corridorStackData, keys: corridorKeys } = pivotMonthlyCorridor(monthlyCorridor);
  const residencyMixChart = toResidencyMixChart(residencyMix);
  const weekendPattern = patternData.filter((row) => row.pattern_type === 'WEEKEND');

  const latest = dailySeries.at(-1);
  const maxDay = dailySeries.reduce<DailyHeadline | undefined>(
    (acc, cur) => (!acc || cur.total_passengers > acc.total_passengers ? cur : acc),
    undefined
  );

  const latestMonth = monthlyCorridor.at(-1);

  return (
    <div className="space-y-6">
      <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-4" method="get">
        <label className="text-sm text-slate-600">
          Start year
          <select name="startYear" defaultValue={startYear ?? ''} className="mt-1 w-full rounded border px-2 py-1">
            <option value="">All</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          End year
          <select name="endYear" defaultValue={endYear ?? ''} className="mt-1 w-full rounded border px-2 py-1">
            <option value="">All</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Corridors
          <select
            multiple
            name="corridor"
            defaultValue={corridorFilter}
            className="mt-1 w-full rounded border px-2 py-1 h-24"
          >
            {corridors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-4 flex gap-2">
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white">
            Apply filters
          </button>
          <a href="/dashboard" className="text-sm text-slate-600 underline">
            Reset
          </a>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Latest 7d avg"
          value={latest?.rolling_7d_avg != null ? latest.rolling_7d_avg.toLocaleString() : '—'}
          sub={latest?.date ? `as of ${latest.date}` : undefined}
        />
        <MetricCard
          label="Peak day"
          value={maxDay ? maxDay.total_passengers.toLocaleString() : '—'}
          sub={maxDay?.date}
        />
        <MetricCard
          label="Latest month total"
          value={latestMonth ? (latestMonth.total_passengers ?? 0).toLocaleString() : '—'}
          sub={latestMonth ? formatYearMonth(latestMonth.year_month) : undefined}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="mb-2 text-sm font-medium text-slate-600">Daily passengers (7d avg)</div>
          <Suspense fallback={<div>Loading chart...</div>}>
            <TimeSeriesChart data={dailySeries} />
          </Suspense>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="mb-2 text-sm font-medium text-slate-600">Top 10 busiest days</div>
          <TopDaysTable rows={topDays} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Corridor composition (monthly, % stacked)</div>
        <Suspense fallback={<div>Loading chart...</div>}>
          <StackedAreaChart data={corridorStackData} keys={corridorKeys} />
        </Suspense>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Residency mix (monthly share)</div>
        <Suspense fallback={<div>Loading chart...</div>}>
          <ResidencyMixChart data={residencyMixChart} />
        </Suspense>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Weekend vs weekday (weekend index)</div>
        <Suspense fallback={<div>Loading chart...</div>}>
          <PatternBarChart data={weekendPattern.map((row) => ({ corridor: row.corridor, weekend_index: row.weekend_index }))} />
        </Suspense>
      </section>
    </div>
  );
}

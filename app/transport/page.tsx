import { Suspense } from 'react';
import MetricCard from '../dashboard/_components/MetricCard';
import StackedAreaChart from '../dashboard/_components/StackedAreaChart';
import TimeSeriesChart from '../dashboard/_components/TimeSeriesChart';
import { cookies } from 'next/headers';
import {
  getAnnualIndicators,
  getLatestModeSnapshot,
  getMonthlyModeSeries,
  getOperatorLatestRanking,
  getOperatorTrend,
  getOperatorsByMode
} from '@/lib/db';
import TransportLatestTable from './_components/TransportLatestTable';
import OperatorTrendChart from './_components/OperatorTrendChart';
import OperatorShareChart from './_components/OperatorShareChart';
import OperatorRankingBar from './_components/OperatorRankingBar';

type SearchParams = Record<string, string | string[] | undefined>;

const yearOptions = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const modeOptions = ['Railways', 'Fran_Bus', 'Ferries', 'PLB', 'TAX', 'RS', 'LRB'];

function parseYear(value: string | undefined) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function formatYearMonth(ym: number) {
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function pivotMode(rows: any[]) {
  const map = new Map<string, Record<string, number | string>>();
  const keys = new Set<string>();
  rows.forEach((row) => {
    const label = formatYearMonth(row.year_month);
    const existing = map.get(label) ?? { label };
    existing[row.mode] = row.avg_daily_pax ?? 0;
    map.set(label, existing);
    keys.add(row.mode);
  });
  const data = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
  return { data, keys: Array.from(keys) };
}

function toAnnualSeries(rows: { year: number; avg_daily_ptp: number }[]) {
  return rows.map((r) => ({
    date: `${r.year}-01-01`,
    total_passengers: r.avg_daily_ptp,
    rolling_7d_avg: null
  }));
}

export default async function Transport({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const chartModeCookie = cookieStore.get('transportChartMode')?.value as 'percent' | 'absolute' | undefined;

  const startYear = parseYear(typeof params.startYear === 'string' ? params.startYear : undefined);
  const endYear = parseYear(typeof params.endYear === 'string' ? params.endYear : undefined);
  const modeParam = typeof params.mode === 'string' && modeOptions.includes(params.mode) ? params.mode : 'Railways';
  const operatorParam =
    typeof params.operator === 'string'
      ? params.operator.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(params.operator)
        ? params.operator.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
        : [];
  const chartModeParam =
    typeof params.chartMode === 'string' && (params.chartMode === 'percent' || params.chartMode === 'absolute')
      ? params.chartMode
      : undefined;
  const chartMode = chartModeParam ?? chartModeCookie ?? 'absolute';

  const [monthlyModes, latestSnapshot, annualIndicators] = await Promise.all([
    getMonthlyModeSeries({ startYear, endYear }),
    getLatestModeSnapshot(),
    getAnnualIndicators()
  ]);

  const [operatorList, operatorTrend, operatorRanking] = await Promise.all([
    getOperatorsByMode(modeParam),
    getOperatorTrend({ mode: modeParam, operators: operatorParam, startYear, endYear }),
    getOperatorLatestRanking({ mode: modeParam })
  ]);

  const { data: modeStack, keys: modeKeys } = pivotMode(monthlyModes);
  const annualSeries = toAnnualSeries(annualIndicators);
  const operatorKeys = Array.from(new Set(operatorTrend.map((r) => r.operator_code ?? 'Unknown')));
  const trendMap = new Map<string, Record<string, number | string>>();
  operatorTrend.forEach((row) => {
    const label = formatYearMonth(row.year_month);
    const existing = trendMap.get(label) ?? { label };
    const name = row.operator_code ?? 'Unknown';
    existing[name] = (existing[name] as number | undefined ?? 0) + (row.avg_daily_pax ?? 0);
    trendMap.set(label, existing);
  });
  const trendData = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  const shareData = trendData.map((row) => {
    const total = operatorKeys.reduce((sum, k) => sum + (Number(row[k] ?? 0)), 0);
    const copy: Record<string, number | string> = { ...row };
    operatorKeys.forEach((k) => {
      copy[k] = total ? (Number(row[k] ?? 0) / total) : 0;
    });
    return copy;
  });

  const rankingRows = operatorRanking.map((r) => ({
    name: [r.operator_code, r.rail_line].filter(Boolean).join(' / ') || 'Unknown',
    value: Number(r.avg_daily_pax ?? 0)
  }));

  const latestAnnual = annualIndicators.at(-1);
  const latestModeSnapshot = latestSnapshot.filter((row) => row.mode === modeParam);
  const topModeEntry = latestModeSnapshot[0];
  const latestMonthTotal =
    latestModeSnapshot.length > 0
      ? latestModeSnapshot.reduce((sum, row) => sum + (row.avg_daily_pax ?? 0), 0)
      : 0;

  return (
    <div className="space-y-6">
      <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-3" method="get">
        <label className="text-sm text-slate-600">
          Mode
          <select name="mode" defaultValue={modeParam} className="mt-1 w-full rounded border px-2 py-1">
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Operators
          <select
            multiple
            name="operator"
            defaultValue={operatorParam}
            className="mt-1 w-full rounded border px-2 py-1 h-24"
          >
            {operatorList.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </label>
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
        <div className="md:col-span-1 flex items-end gap-2">
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-white">
            Apply filters
          </button>
          <a href="/transport" className="text-sm text-slate-600 underline">
            Reset
          </a>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label={`Latest avg daily PT journeys (${modeParam})`}
          value={
            latestModeSnapshot.length
              ? latestModeSnapshot.reduce((sum, row) => sum + (row.avg_daily_pax ?? 0), 0).toLocaleString()
              : '—'
          }
          sub={latestModeSnapshot.length ? formatYearMonth(latestModeSnapshot[0].year_month) : undefined}
        />
        <MetricCard
          label="Latest month (selected mode)"
          value={latestModeSnapshot.length ? latestMonthTotal.toLocaleString() : '—'}
          sub={latestModeSnapshot.length ? formatYearMonth(latestModeSnapshot[0].year_month) : undefined}
        />
        <MetricCard
          label="Top operator (latest month)"
          value={
            topModeEntry
              ? `${[topModeEntry.operator_code, topModeEntry.rail_line].filter(Boolean).join(' / ') || 'Unknown'} — ${Number(
                  topModeEntry.avg_daily_pax ?? 0
                ).toLocaleString()}`
              : '—'
          }
          sub={latestModeSnapshot.length ? formatYearMonth(latestModeSnapshot[0].year_month) : undefined}
        />
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600">
          <span>Monthly patronage by mode (avg daily)</span>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="mode" value={modeParam} />
            <input type="hidden" name="operator" value={operatorParam.join(',')} />
            <input type="hidden" name="startYear" value={startYear ?? ''} />
            <input type="hidden" name="endYear" value={endYear ?? ''} />
            <button
              type="submit"
              name="chartMode"
              value={chartMode === 'percent' ? 'absolute' : 'percent'}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              View as {chartMode === 'percent' ? 'absolute' : 'percent'}
            </button>
          </form>
        </div>
        <Suspense fallback={<div>Loading chart...</div>}>
          <StackedAreaChart data={modeStack} keys={modeKeys} mode={chartMode} />
        </Suspense>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Annual average daily PT journeys</div>
        <Suspense fallback={<div>Loading chart...</div>}>
          <TimeSeriesChart data={annualSeries} />
        </Suspense>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Operator trend ({modeParam})</div>
        <OperatorTrendChart data={trendData as Array<{label: string; [key: string]: string | number}>} keys={operatorKeys} />
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Operator share ({modeParam}, %)</div>
        <OperatorShareChart data={shareData} keys={operatorKeys} />
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Latest month ranking ({modeParam})</div>
        <OperatorRankingBar rows={rankingRows} />
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">Latest month by operator</div>
        <TransportLatestTable
          rows={latestSnapshot.map((row) => ({
            id: `${row.mode}-${row.operator_code ?? 'na'}-${row.rail_line ?? 'na'}-${formatYearMonth(row.year_month)}`,
            year_month: row.year_month,
            mode: row.mode,
            operator_code: row.operator_code,
            rail_line: row.rail_line,
            avg_daily_pax: row.avg_daily_pax
          }))}
        />
      </section>
    </div>
  );
}

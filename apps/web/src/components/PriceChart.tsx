import { useMemo, useState } from 'react';
import type { OilPrice } from '../lib/api';
import { formatNumber, qualityLabels, type OilPriceQuality } from '../lib/format';
import { useHydrated } from '../lib/hydrated';

/**
 * The historical price chart (spec §10.2, §10.6).
 *
 * Recharts is behind a dynamic import so it lands in its own chunk: the spec
 * requires this chart to be the only place the library is loaded, and pulling
 * it in eagerly would blow the JS budget of every other page.
 */
type Props = {
  series: OilPrice[];
};

const qualities: OilPriceQuality[] = ['extra', 'virgin', 'lampante'];

export default function PriceChart({ series }: Props) {
  /**
   * Default to a quality the page actually has data for.
   *
   * The hardcoded default was `virgin`, and the POOLred page only carries `extra`,
   * so the chart silently rendered "no data for this quality" and no button to
   * ever recover. Deriving it from the series means a page that ships one quality
   * plots that one, and the tabs still appear for whatever is present.
   */
  const available = useMemo(
    () => qualities.filter((candidate) => series.some((row) => row.quality === candidate)),
    [series],
  );

  const [quality, setQuality] = useState<OilPriceQuality | null>(null);

  const effective = quality ?? available[0] ?? null;

  /**
   * Whether these figures came from POOLred, which changes how the chart should
   * describe itself. Derived from the data rather than passed in, so a page
   * cannot mislabel its own provenance.
   */
  const source = series[0]?.source === 'poolred' ? 'poolred' : 'manual';
  const [Chart, setChart] = useState<React.ComponentType<ChartProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useHydrated();

  const points = useMemo(
    () =>
      series
        .filter((row) => row.quality === effective)
        .map((row) => ({
          week: formatNumber(row.week_start.slice(8, 10)) + '/' + formatNumber(row.week_start.slice(5, 7)),
          // €/kg is what a grower actually compares, not €/tonne.
          eurKg: Number.parseFloat(row.avg_price_eur_kg),
        }))
        .sort((a, b) => a.week.localeCompare(b.week)),
    [series, effective],
  );

  // The chart is only fetched the first time the user interacts with the page.
  const showChart = async () => {
    if (Chart !== null || loading) return;
    setLoading(true);
    try {
      const recharts = await import('./PriceChartInner');
      setChart(() => recharts.default);
    } finally {
      setLoading(false);
    }
  };

  // Wrapped because React event handlers must return void and this one is
  // async: it dynamically imports the chart library.
  const onInteract = () => {
    void showChart();
  };

  return (
    <section className="card" onMouseEnter={onInteract} onFocus={onInteract} aria-busy={!hydrated}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-olive-800">Histórico de precios</h2>
        <div role="group" aria-label="Calidad del aceite" className="flex gap-2">
          {available.map((option) => (
            <button
              key={option}
              type="button"
              className={option === effective ? 'btn btn-primary' : 'btn btn-secondary'}
              aria-pressed={option === effective}
              disabled={!hydrated}
              onClick={() => {
                setQuality(option);
                void showChart();
              }}
            >
              {qualityLabels[option]}
            </button>
          ))}
        </div>
      </div>

      {Chart !== null ? (
        <Chart points={points} />
      ) : (
        <button
          type="button"
          className="mt-4 btn btn-secondary"
          // Same reason as the calculator forms (ADR-0010): before hydration
          // there is no click handler, so a press would simply do nothing.
          disabled={!hydrated}
          onClick={() => void showChart()}
        >
          {loading ? 'Cargando gráfica…' : 'Ver la gráfica'}
        </button>
      )}

      {/*
        The quality tabs now list only what this page actually received, so the
        importer publishing one index does not leave two tabs that render an empty
        chart. With a single quality there is nothing to switch between, and a row
        of dead tabs would only invite a click that changes nothing.
      */}
      {available.length > 1 && (
        <p className="sr-only" role="status">
          Calidad mostrada: {qualityLabels[effective ?? 'extra']}
        </p>
      )}

      <p className="mt-3 text-xs text-earth-600">
        {source === 'poolred'
          ? 'Índice iPOOL de POOLred, en euros por kilo. Serie diaria agregada por semana.'
          : 'Precios en euros por kilo de aceite. Última serie disponible del extracto de la API.'}
      </p>
    </section>
  );
}

export type ChartPoint = { week: string; eurKg: number };
export type ChartProps = { points: ChartPoint[] };

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
  const [quality, setQuality] = useState<OilPriceQuality>('virgin');
  const [Chart, setChart] = useState<React.ComponentType<ChartProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useHydrated();

  const points = useMemo(
    () =>
      series
        .filter((row) => row.quality === quality)
        .map((row) => ({
          week: formatNumber(row.week_start.slice(8, 10)) + '/' + formatNumber(row.week_start.slice(5, 7)),
          // €/kg is what a grower actually compares, not €/tonne.
          eurKg: Number.parseFloat(row.avg_price_eur_kg),
        }))
        .sort((a, b) => a.week.localeCompare(b.week)),
    [series, quality],
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
          {qualities.map((option) => (
            <button
              key={option}
              type="button"
              className={option === quality ? 'btn btn-primary' : 'btn btn-secondary'}
              aria-pressed={option === quality}
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

      <p className="mt-3 text-xs text-earth-600">
        Precios en euros por kilo de aceite. Última serie disponible del extracto de la API.
      </p>
    </section>
  );
}

export type ChartPoint = { week: string; eurKg: number };
export type ChartProps = { points: ChartPoint[] };

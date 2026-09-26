import { useMemo, useState } from 'react';
import {
  costLineKeys,
  type CostPerHectareResult,
  type CostLineKey,
} from '@olivar/calculations';

import ResultPanel from './ResultPanel';
import { useHydrated } from '../lib/hydrated';
import { firstIssueOf, loadEngine } from '../lib/engine';
import { useCostPerHaStore } from '../stores/useCostPerHaStore';
import type { ParamSetPayload, ResultSummary } from '../lib/types';
import { formatKg, formatMoney } from '../lib/format';

/**
 * Cost and margin per hectare (spec §4.6, §10.3).
 *
 * The eleven cost lines are the point of this tool, so they get a real form
 * rather than a single "total cost" field: the answer depends on which costs
 * dominate, and the cost breakdown chart only means something if the grower
 * entered the lines themselves.
 */
type Props = { paramSet: ParamSetPayload };

const costLineLabels: Record<CostLineKey, string> = {
  pruning: 'Poda',
  fertilization: 'Fertilización',
  phytosanitary: 'Fitorosanidad',
  irrigation: 'Riego',
  harvest: 'Recogida',
  soilManagement: 'Manejo del suelo',
  machinery: 'Maquinaria',
  insurance: 'Seguros',
  coopFees: 'Cuotas de cooperativa',
  other: 'Otros',
  depreciation: 'Depreciación',
};

export default function CostPerHectareCalculator({ paramSet }: Props) {
  const store = useCostPerHaStore();
  const [result, setResult] = useState<CostPerHectareResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  const paramSetForCalc = useMemo(
    () => ({
      version: paramSet.version,
      campaign: paramSet.campaign,
      published_at: paramSet.published_at ?? '',
      params: paramSet.params,
    }),
    [paramSet],
  );

  const summary: ResultSummary | null = useMemo(() => {
    if (result === null) return null;

    return {
      headline: formatMoney(result.marginPerHa),
      headlineLabel: 'Margen por hectárea',
      figures: [
        { label: 'Coste por hectárea', value: formatMoney(result.totalCostPerHa) },
        { label: 'Coste total', value: formatMoney(result.totalCost) },
        { label: 'Aceite por hectárea', value: `${formatKg(result.kgOilPerHa)} kg` },
        { label: 'Ingresos por hectárea', value: formatMoney(result.revenuePerHa) },
        { label: 'Coste por kg de aceituna', value: formatMoney(result.costPerKgOlive) },
        { label: 'Coste por kg de aceite', value: formatMoney(result.costPerKgOil) },
        { label: 'Precio de equilibrio', value: formatMoney(result.breakEvenOilPrice) },
      ],
      breakdown: result.breakdown,
      warnings: result.warnings,
      shareText: `Mi olivar: margen de ${formatMoney(result.marginPerHa)} por hectárea, con un coste de ${formatMoney(result.totalCostPerHa)}.`,
    };
  }, [result]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    // A blank cost line means zero, not "unknown": the grower is expected to
    // fill in only what applies, and the calculator sums what is there.
    const missing = costLineKeys.filter((key) => store.costLines[key].trim() === '');
    if (missing.length === costLineKeys.length) {
      setFormError('Indica al menos un coste por hectárea.');
      return;
    }
    if (store.hectares.trim() === '') {
      setFormError('Indica cuántas hectáreas tienes.');
      return;
    }
    if (store.yieldKgOlivesPerHa.trim() === '') {
      setFormError('Indica la producción de aceituna por hectárea.');
      return;
    }
    if (store.industrialYieldPct.trim() === '') {
      setFormError('Indica el rendimiento industrial.');
      return;
    }
    if (store.pricingMode === 'oil_price' && store.oilPriceEurKg.trim() === '') {
      setFormError('Indica el precio del aceite por kilo.');
      return;
    }
    if (store.pricingMode === 'olive_price' && store.olivePriceEurKg.trim() === '') {
      setFormError('Indica el precio de la aceituna por kilo.');
      return;
    }

    setBusy(true);
    try {
      const { calculateCostPerHectare } = await loadEngine();

      const costLines = Object.fromEntries(
        costLineKeys.map((key) => [key, store.costLines[key].trim() || '0']),
      ) as Record<CostLineKey, string>;

      setResult(
        calculateCostPerHectare(
          {
            system: store.system,
            irrigation: store.irrigation,
            hectares: store.hectares,
            yieldKgOlivesPerHa: store.yieldKgOlivesPerHa,
            industrialYieldPct: store.industrialYieldPct,
            pricingMode: store.pricingMode,
            ...(store.pricingMode === 'oil_price'
              ? { oilPriceEurKg: store.oilPriceEurKg }
              : { olivePriceEurKg: store.olivePriceEurKg }),
            costLines,
            ...(store.subsidiesEurPerHa.trim() !== ''
              ? { subsidiesEurPerHa: store.subsidiesEurPerHa }
              : {}),
          },
          paramSetForCalc,
        ),
      );
    } catch (error) {
      setResult(null);
      setFormError(
        error instanceof Error ? `Revisa los datos: ${firstIssueOf(error)}` : 'No se ha podido calcular.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="card space-y-4"
        noValidate
        aria-busy={!hydrated}
        onSubmit={(event) => {
          void submit(event);
        }}
      >

        {!hydrated && (
          <p role="status" className="rounded border border-earth-200 bg-earth-50 p-3 text-sm">
            Preparando la calculadora…
          </p>
        )}

        {/*
          A disabled fieldset disables every control inside it natively, which
          is the one change an island needs. `contents` keeps the wrapper out of
          the layout, so the server-rendered and hydrated markup stay identical.
        */}
        <fieldset className="contents" disabled={!hydrated}>
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold text-olive-800">Tu olivar</legend>

          <label className="block">
            <span className="field-label">Sistema</span>
            <select
              className="field-input"
              value={store.system}
              onChange={(e) => store.set({ system: e.target.value as 'traditional' | 'intensive' | 'superintensive' })}
            >
              <option value="traditional">Tradicional</option>
              <option value="intensive">Intensivo</option>
              <option value="superintensive">Superintensivo</option>
            </select>
          </label>

          <label className="block">
            <span className="field-label">Riego</span>
            <select
              className="field-input"
              value={store.irrigation}
              onChange={(e) => store.set({ irrigation: e.target.value as 'dry' | 'irrigated' })}
            >
              <option value="dry">Seco</option>
              <option value="irrigated">Regadío</option>
            </select>
          </label>

          <label className="block">
            <span className="field-label">Hectáreas</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.hectares}
              onChange={(e) => store.set({ hectares: e.target.value })}
              required
            />
          </label>

          <label className="block">
            <span className="field-label">Aceituna por hectárea (kg)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.yieldKgOlivesPerHa}
              onChange={(e) => store.set({ yieldKgOlivesPerHa: e.target.value })}
              required
            />
          </label>

          <label className="block">
            <span className="field-label">Rendimiento industrial (%)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.industrialYieldPct}
              onChange={(e) => store.set({ industrialYieldPct: e.target.value })}
              required
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Precios</legend>

          <label className="block">
            <span className="field-label">¿Cómo calculas los ingresos?</span>
            <select
              className="field-input"
              value={store.pricingMode}
              onChange={(e) => store.set({ pricingMode: e.target.value as 'oil_price' | 'olive_price' })}
            >
              <option value="oil_price">Por kilo de aceite</option>
              <option value="olive_price">Por kilo de aceituna</option>
            </select>
          </label>

          {store.pricingMode === 'oil_price' ? (
            <label className="block">
              <span className="field-label">Precio del aceite por kilo</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.oilPriceEurKg}
                onChange={(e) => store.set({ oilPriceEurKg: e.target.value })}
              />
            </label>
          ) : (
            <label className="block">
              <span className="field-label">Precio de la aceituna por kilo</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.olivePriceEurKg}
                onChange={(e) => store.set({ olivePriceEurKg: e.target.value })}
              />
            </label>
          )}

          <label className="block">
            <span className="field-label">Subvenciones por hectárea (opcional)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.subsidiesEurPerHa}
              onChange={(e) => store.set({ subsidiesEurPerHa: e.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Costes por hectárea (€/ha)</legend>
          <p className="text-sm text-earth-600">
            Rellena solo las líneas que te apliquen. Las que dejes vacías se cuentan como 0.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {costLineKeys.map((key) => (
              <label key={key} className="block">
                <span className="field-label text-sm">{costLineLabels[key]}</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.costLines[key]}
                  onChange={(e) => store.setCostLine(key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {formError !== null && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Calculando…' : 'Calcular coste y margen'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={store.reset}>
            Borrar
          </button>
        </div>
        </fieldset>

      </form>

      <div className="space-y-4">
        <ResultPanel
          summary={summary}
          paramSetVersion={paramSet.version}
          parametersUpdatedAt={paramSet.published_at}
          emptyHint="Rellena los datos del olivar y pulsa «Calcular coste y margen»."
        />

        {result !== null && result.costBreakdown.length > 0 && (
          <section className="card">
            <h2 className="text-lg font-semibold text-olive-800">Reparto de costes</h2>
            <ul className="mt-3 space-y-1">
              {result.costBreakdown.map((line) => (
                <li key={line.key} className="flex justify-between text-sm">
                  <span>{line.label}</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(line.value)} €/ha
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-earth-600">
              Total: {formatMoney(result.totalCostPerHa)} €/ha
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
// Type-only, so it costs nothing at runtime. The engine, zod included, is
// loaded on demand: see `loadEngine`.
import type * as Calculations from '@olivar/calculations';
import type { SettlementResult } from '@olivar/calculations';

import ResultPanel from './ResultPanel';
import { useSettlementStore } from '../stores/useSettlementStore';
import type { ParamSetPayload, ResultSummary } from '../lib/types';
import {
  formatKg,
  formatLiters,
  formatMoney,
  formatPercent,
  harvestTypeLabels,
  vatRegimeLabels,
} from '../lib/format';

/**
 * The settlement calculator island (spec §4.3, §10.3).
 *
 * All arithmetic happens here in the browser, with the same
 * `@olivar/calculations` package the tests pin. The API is never asked to
 * recompute: it would need the same parameters and the same formula version,
 * and two implementations of a settlement is two chances to be wrong.
 */
type Props = { paramSet: ParamSetPayload };

export default function SettlementCalculator({ paramSet }: Props) {
  const store = useSettlementStore();
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      headline: formatMoney(result.netToReceive),
      headlineLabel: 'Neto a percibir',
      figures: [
        { label: 'Aceituna entregada', value: `${formatKg(result.totalKgOlives)} kg` },
        { label: 'Aceite obtenido', value: `${formatKg(result.totalKgOil)} kg` },
        { label: 'Aceite en litros', value: `${formatLiters(result.litersOil)} L` },
        { label: 'Rendimiento industrial', value: formatPercent(result.avgIndustrialYieldPct) },
        { label: 'Base imponible', value: formatMoney(result.taxableBase) },
        { label: 'IVA / REAGP', value: formatMoney(result.vatAmount) },
        { label: 'Retención IRPF', value: formatMoney(result.withholding) },
        ...(result.withdrawnAmount !== '0.00'
          ? [{ label: 'Aceite retirado', value: formatMoney(result.withdrawnAmount) }]
          : []),
        { label: 'Precio por kg de aceituna', value: formatMoney(result.effectivePricePerKgOlive) },
      ],
      breakdown: result.breakdown,
      warnings: result.warnings,
      shareText: shareText(result),
    };
  }, [result]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const firstError = validate();
    if (firstError !== null) {
      setFormError(firstError);
      return;
    }

    setBusy(true);
    try {
      const { calculateSettlement } = await loadEngine();
      setResult(calculateSettlement(buildInput(), paramSetForCalc));
    } catch (error) {
      setResult(null);
      setFormError(
        error instanceof Error
          ? `Revisa los datos: ${firstIssueOf(error)}`
          : 'No se ha podido calcular. Revisa los datos.',
      );
    } finally {
      setBusy(false);
    }
  };

  /** Cheap client-side checks so the farmer gets a clear message, not a zod dump. */
  function validate(): string | null {
    if (store.deliveries.some((d) => d.kgOlives.trim() === '')) {
      return 'Indica los kilos de aceituna de cada entrega.';
    }
    if (store.pricingMode === 'oil_price' && store.oilPriceEurKg.trim() === '') {
      return 'Indica el precio del aceite por kilo.';
    }
    if (store.pricingMode === 'olive_price' && store.olivePriceEurKg.trim() === '') {
      return 'Indica el precio de la aceituna por kilo.';
    }
    if (store.coopCostsEurPerKgOlive.trim() === '') {
      return 'Indica los costes de almazara por kilo de aceituna.';
    }
    if (!store.useIndustrialYield && store.correctionIndexPts.trim() === '') {
      return 'Indica el índice corrector o el rendimiento industrial.';
    }
    if (store.withdrawOil && store.withdrawnPriceEurKg.trim() === '') {
      return 'Indica el precio del aceite retirado.';
    }
    return null;
  }

  function buildInput() {
    const useKg = store.withdrawnKg.trim() !== '';
    return {
      deliveries: store.deliveries.map((d) => ({
        kgOlives: d.kgOlives,
        fatYieldTotalPct: d.fatYieldTotalPct,
        harvestType: d.harvestType,
      })),
      ...(store.useIndustrialYield
        ? { industrialYieldPct: store.industrialYieldPct }
        : { correctionIndexPts: store.correctionIndexPts }),
      pricingMode: store.pricingMode,
      ...(store.pricingMode === 'oil_price'
        ? {
            oilPriceEurKg: store.oilPriceEurKg,
            ...(store.oilPriceGroundEurKg.trim() !== ''
              ? { oilPriceGroundEurKg: store.oilPriceGroundEurKg }
              : {}),
          }
        : {
            olivePriceEurKg: store.olivePriceEurKg,
            ...(store.olivePriceGroundEurKg.trim() !== ''
              ? { olivePriceGroundEurKg: store.olivePriceGroundEurKg }
              : {}),
          }),
      coopCostsEurPerKgOlive: store.coopCostsEurPerKgOlive,
      vatRegime: store.vatRegime,
      applyIrpfWithholding: store.applyIrpfWithholding,
      ...(store.withdrawOil
        ? {
            oilWithdrawn: {
              ...(useKg
                ? { kg: store.withdrawnKg }
                : { liters: store.withdrawnLiters }),
              priceEurKg: store.withdrawnPriceEurKg,
            },
          }
        : {}),
    };
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="card space-y-4"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold text-olive-800">Entregas</legend>

          {store.deliveries.map((delivery, index) => (
            <fieldset key={delivery.id} className="rounded border border-earth-200 p-3">
              <legend className="px-1 text-sm font-semibold">
                Entrega {index + 1}
                {store.deliveries.length > 1 && (
                  <button
                    type="button"
                    className="ml-2 text-xs font-normal text-red-700 underline"
                    onClick={() => store.removeDelivery(delivery.id)}
                  >
                    Quitar
                  </button>
                )}
              </legend>

              <label className="mt-2 block">
                <span className="field-label">Kilos de aceituna</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  value={delivery.kgOlives}
                  onChange={(e) => store.updateDelivery(delivery.id, { kgOlives: e.target.value })}
                  required
                />
              </label>

              <label className="mt-2 block">
                <span className="field-label">Rendimiento graso total (%)</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={delivery.fatYieldTotalPct}
                  onChange={(e) =>
                    store.updateDelivery(delivery.id, { fatYieldTotalPct: e.target.value })
                  }
                />
              </label>

              <label className="mt-2 block">
                <span className="field-label">Tipo de aceituna</span>
                <select
                  className="field-input"
                  value={delivery.harvestType}
                  onChange={(e) =>
                    store.updateDelivery(delivery.id, {
                      harvestType: e.target.value as 'tree' | 'ground',
                    })
                  }
                >
                  <option value="tree">{harvestTypeLabels.tree}</option>
                  <option value="ground">{harvestTypeLabels.ground}</option>
                </select>
              </label>
            </fieldset>
          ))}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={store.addDelivery}
          >
            Añadir otra entrega
          </button>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Rendimiento</legend>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={store.useIndustrialYield}
              onChange={(e) => store.set({ useIndustrialYield: e.target.checked })}
            />
            <span className="text-sm">Indicar el rendimiento industrial en vez del índice corrector</span>
          </label>

          {store.useIndustrialYield ? (
            <label className="block">
              <span className="field-label">Rendimiento industrial (%)</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.industrialYieldPct}
                onChange={(e) => store.set({ industrialYieldPct: e.target.value })}
              />
            </label>
          ) : (
            <label className="block">
              <span className="field-label">Índice corrector (puntos)</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.correctionIndexPts}
                onChange={(e) => store.set({ correctionIndexPts: e.target.value })}
              />
            </label>
          )}
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Precios</legend>

          <label className="block">
            <span className="field-label">¿Te pagan por aceite o por aceituna?</span>
            <select
              className="field-input"
              value={store.pricingMode}
              onChange={(e) =>
                store.set({ pricingMode: e.target.value as 'oil_price' | 'olive_price' })
              }
            >
              <option value="oil_price">Por kilo de aceite</option>
              <option value="olive_price">Por kilo de aceituna</option>
            </select>
          </label>

          {store.pricingMode === 'oil_price' ? (
            <>
              <label className="block">
                <span className="field-label">Precio del aceite por kilo (aceituna de vuelo)</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.oilPriceEurKg}
                  onChange={(e) => store.set({ oilPriceEurKg: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="field-label">Precio del aceite de suelo (opcional)</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.oilPriceGroundEurKg}
                  onChange={(e) => store.set({ oilPriceGroundEurKg: e.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className="field-label">Precio de la aceituna por kilo (vuelo)</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.olivePriceEurKg}
                  onChange={(e) => store.set({ olivePriceEurKg: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="field-label">Precio de la aceituna de suelo (opcional)</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.olivePriceGroundEurKg}
                  onChange={(e) => store.set({ olivePriceGroundEurKg: e.target.value })}
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="field-label">Costes de almazara por kilo de aceituna</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.coopCostsEurPerKgOlive}
              onChange={(e) => store.set({ coopCostsEurPerKgOlive: e.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Impuestos</legend>

          <label className="block">
            <span className="field-label">Régimen de IVA</span>
            <select
              className="field-input"
              value={store.vatRegime}
              onChange={(e) => store.set({ vatRegime: e.target.value as 'reagp' | 'general' | 'none' })}
            >
              {Object.entries(vatRegimeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={store.applyIrpfWithholding}
              onChange={(e) => store.set({ applyIrpfWithholding: e.target.checked })}
            />
            <span className="text-sm">Aplicar retención de IRPF</span>
          </label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Aceite retirado (opcional)</legend>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={store.withdrawOil}
              onChange={(e) => store.set({ withdrawOil: e.target.checked })}
            />
            <span className="text-sm">He retirado aceite de mi liquidación</span>
          </label>

          {store.withdrawOil && (
            <>
              <label className="block">
                <span className="field-label">Kilos retirados</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.withdrawnKg}
                  onChange={(e) => store.set({ withdrawnKg: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="field-label">Litros retirados (si no has indicado kilos)</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.withdrawnLiters}
                  onChange={(e) => store.set({ withdrawnLiters: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="field-label">Precio de ese aceite por kilo</span>
                <input
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={store.withdrawnPriceEurKg}
                  onChange={(e) => store.set({ withdrawnPriceEurKg: e.target.value })}
                />
              </label>
            </>
          )}
        </fieldset>

        {formError !== null && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Calculando…' : 'Calcular liquidación'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={store.reset}>
            Borrar
          </button>
        </div>
      </form>

      <div>
        <ResultPanel
          summary={summary}
          paramSetVersion={paramSet.version}
          parametersUpdatedAt={paramSet.published_at}
          emptyHint="Rellena los datos de la entrega y pulsa «Calcular liquidación»."
        />
      </div>
    </div>
  );
}

function shareText(result: SettlementResult): string {
  return [
    `Mi liquidación de aceituna: ${formatMoney(result.netToReceive)} netos.`,
    `Aceite obtenido: ${formatKg(result.totalKgOil)} kg (${formatLiters(result.litersOil)} L).`,
  ].join(' ');
}

/** Pull the first human-readable issue out of a zod error. */
function firstIssueOf(error: unknown): string {
  const issues = (error as { issues?: Array<{ message: string }> }).issues;
  return issues?.[0]?.message ?? 'alguno de los campos no es válido';
}

/**
 * The calculation engine, zod and big.js included, is a lazy chunk.
 *
 * Spec §4.1 requires zod validation, and zod is the single heaviest thing the
 * island would otherwise pull in. Loading it on the first click keeps the
 * initial payload inside the §10.6 budget and lets the calculator paint long
 * before the engine arrives. Cached after the first call.
 */
type CalculationsModule = typeof Calculations;

let enginePromise: Promise<CalculationsModule> | null = null;

function loadEngine(): Promise<CalculationsModule> {
  enginePromise ??= import('@olivar/calculations');
  return enginePromise;
}

// Imported at the bottom so the form markup reads first.

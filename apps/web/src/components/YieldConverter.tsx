import { useMemo, useState } from 'react';
import type { YieldConverterResult } from '@olivar/calculations';

import ResultPanel from './ResultPanel';
import { useHydrated } from '../lib/hydrated';
import { firstIssueOf, loadEngine } from '../lib/engine';
import { useYieldStore } from '../stores/useYieldStore';
import type { ParamSetPayload, ResultSummary } from '../lib/types';
import { formatKg, formatLiters, formatPercent } from '../lib/format';

/**
 * The yield converter island (spec §4.4, §10.3).
 *
 * Answers two questions a grower has: what industrial yield do I actually get,
 * and how many kilos of olives do I need for a given volume of oil.
 */
type Props = { paramSet: ParamSetPayload };

export default function YieldConverter({ paramSet }: Props) {
  const store = useYieldStore();
  const [result, setResult] = useState<YieldConverterResult | null>(null);
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

    const figures = [
      { label: 'Rendimiento industrial', value: formatPercent(result.industrialYieldPct) },
    ];

    if (result.fatYieldDryPct !== null) {
      figures.push({ label: 'Graso sobre seco', value: formatPercent(result.fatYieldDryPct) });
    }
    if (result.kgOil !== null) {
      figures.push({ label: 'Aceite obtenido', value: `${formatKg(result.kgOil)} kg` });
    }
    if (result.litersOil !== null) {
      figures.push({ label: 'En litros', value: `${formatLiters(result.litersOil)} L` });
    }
    if (result.kgOlivesPerKgOil !== null) {
      figures.push({
        label: 'Aceituna por kg de aceite',
        value: `${formatKg(result.kgOlivesPerKgOil)} kg`,
      });
    }
    if (result.kgOlivesPerLiter !== null) {
      figures.push({
        label: 'Aceituna por litro',
        value: `${formatKg(result.kgOlivesPerLiter)} kg`,
      });
    }
    if (result.kgOlivesNeeded !== null) {
      figures.push({
        label: 'Aceituna necesaria',
        value: `${formatKg(result.kgOlivesNeeded)} kg`,
      });
    }

    return {
      headline: formatPercent(result.industrialYieldPct),
      headlineLabel: 'Rendimiento industrial',
      figures,
      breakdown: result.breakdown,
      warnings: result.warnings,
      shareText: `Rendimiento industrial de mi aceituna: ${formatPercent(result.industrialYieldPct)}.`,
    };
  }, [result]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (store.fatYieldTotalPct.trim() === '') {
      setFormError('Indica el rendimiento graso total del análisis.');
      return;
    }
    if (store.mode === 'forward' && store.kgOlives.trim() === '' && store.moisturePct.trim() === '') {
      setFormError('Indica los kilos de aceituna o la humedad para obtener más datos.');
      return;
    }
    if (store.mode === 'inverse' && store.targetLiters.trim() === '') {
      setFormError('Indica cuántos litros de aceite necesitas.');
      return;
    }

    setBusy(true);
    try {
      const { calculateYieldConverter } = await loadEngine();
      setResult(
        calculateYieldConverter(
          {
            fatYieldTotalPct: store.fatYieldTotalPct,
            ...(store.correctionIndexPts.trim() !== ''
              ? { correctionIndexPts: store.correctionIndexPts }
              : {}),
            ...(store.moisturePct.trim() !== ''
              ? { moisturePct: store.moisturePct }
              : {}),
            ...(store.mode === 'forward' && store.kgOlives.trim() !== ''
              ? { kgOlives: store.kgOlives }
              : {}),
            ...(store.mode === 'inverse' ? { targetLiters: store.targetLiters } : {}),
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
          <legend className="text-lg font-semibold text-olive-800">Análisis</legend>

          <label className="block">
            <span className="field-label">Rendimiento graso total (%)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.fatYieldTotalPct}
              onChange={(e) => store.set({ fatYieldTotalPct: e.target.value })}
              required
            />
            <span className="text-sm text-earth-600">
              El porcentaje de aceite sobre el peso total de la aceituna.
            </span>
          </label>

          <label className="block">
            <span className="field-label">Índice corrector (puntos)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.correctionIndexPts}
              onChange={(e) => store.set({ correctionIndexPts: e.target.value })}
            />
            <span className="text-sm text-earth-600">
              El aceite que queda en el alpeorujo y no se te paga.
            </span>
          </label>

          <label className="block">
            <span className="field-label">Humedad (%) · opcional</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.moisturePct}
              onChange={(e) => store.set({ moisturePct: e.target.value })}
            />
            <span className="text-sm text-earth-600">Para calcular el graso sobre seco.</span>
          </label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Cálculo</legend>

          <label className="block">
            <span className="field-label">¿Qué quieres calcular?</span>
            <select
              className="field-input"
              value={store.mode}
              onChange={(e) => store.set({ mode: e.target.value as 'forward' | 'inverse' })}
            >
              <option value="forward">Rendimiento y aceite obtenido</option>
              <option value="inverse">Aceituna necesaria para X litros</option>
            </select>
          </label>

          {store.mode === 'forward' ? (
            <label className="block">
              <span className="field-label">Kilos de aceituna</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.kgOlives}
                onChange={(e) => store.set({ kgOlives: e.target.value })}
              />
            </label>
          ) : (
            <label className="block">
              <span className="field-label">Litros de aceite que necesitas</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.targetLiters}
                onChange={(e) => store.set({ targetLiters: e.target.value })}
              />
            </label>
          )}
        </fieldset>

        {formError !== null && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Calculando…' : 'Calcular'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={store.reset}>
            Borrar
          </button>
        </div>
        </fieldset>

      </form>

      <div>
        <ResultPanel
          summary={summary}
          paramSetVersion={paramSet.version}
          parametersUpdatedAt={paramSet.published_at}
          emptyHint="Introduce el rendimiento graso del análisis y pulsa «Calcular»."
        />
      </div>
    </div>
  );
}

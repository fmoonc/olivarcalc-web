import { useMemo, useState } from 'react';
import type { HarvestCrewResult } from '@olivar/calculations';

import ResultPanel from './ResultPanel';
import { firstIssueOf, loadEngine } from '../lib/engine';
import { provinces, useCrewStore } from '../stores/useCrewStore';
import type { ParamSetPayload, ResultSummary } from '../lib/types';
import { formatKg, formatMoney } from '../lib/format';

/**
 * Harvest crew cost (spec §4.7, §10.3).
 *
 * The daily wage comes from the convenio for the chosen province, and the
 * grower can override it when they know better. The fixed disclaimer of §4.7
 * travels with every result, because employer contributions depend on each
 * individual contract.
 */
type Props = { paramSet: ParamSetPayload };

const EMPLOYER_COST_PARAM = 'labor.employer_cost_pct';

/** Must match `wageParamKey()` in @olivar/calculations (spec §4.7). */
const wageKey = (province: string, category: string): string =>
  `wages.${province}.${category}.daily_eur`;

const hasValue = (paramSet: ParamSetPayload, key: string): boolean => {
  const param = paramSet.params[key];
  return param !== undefined && param.value.trim() !== '';
};

export default function HarvestCrewCalculator({ paramSet }: Props) {
  const store = useCrewStore();
  const [result, setResult] = useState<HarvestCrewResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Spec §0.2 seeds both the provincial wage and the employer cost empty until
   * the owner confirms them, so neither is usually available. The island holds
   * the whole paramSet, so it can say so before the user fills the form
   * instead of failing after they press the button.
   */
  const officialEmployerCost = hasValue(paramSet, EMPLOYER_COST_PARAM);
  const officialWage = hasValue(paramSet, wageKey(store.province, store.category));

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
      headline: formatMoney(result.costPerKgOlive),
      headlineLabel: 'Coste por kg de aceituna',
      figures: [
        { label: 'Coste total', value: formatMoney(result.total) },
        { label: 'Jornal diario', value: formatMoney(result.dailyWage) },
        { label: 'Coste de jornales', value: formatMoney(result.wagesTotal) },
        { label: 'Sobrecoste empresarial', value: formatMoney(result.employerCost) },
        { label: 'Maquinaria y transporte', value: formatMoney(result.opsTotal) },
        { label: 'Aceituna recogida', value: `${formatKg(result.kgHarvested)} kg` },
      ],
      breakdown: result.breakdown,
      warnings: result.warnings,
      shareText: `Mi cuadrilla: ${formatMoney(result.total)} para recoger ${formatKg(result.kgHarvested)} kg.`,
    };
  }, [result]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (store.workers.trim() === '') {
      setFormError('Indica cuántos trabajadores.');
      return;
    }
    if (store.days.trim() === '') {
      setFormError('Indica cuántos días dura la campaña.');
      return;
    }
    if (store.kgPerWorkerPerDay.trim() === '') {
      setFormError('Indica los kg que recoge cada trabajador al día.');
      return;
    }
    if (!officialWage && store.dailyWageOverrideEur.trim() === '') {
      setFormError(
        'El jornal del convenio de esa provincia aún no está confirmado. Indica el jornal diario a mano.',
      );
      return;
    }
    if (!officialEmployerCost && store.employerCostMode === 'param') {
      setFormError(
        'El sobrecoste empresarial oficial aún no está confirmado. Indica el porcentaje o espera a que se publique.',
      );
      return;
    }
    if (store.employerCostMode === 'manual' && store.employerCostPctManual.trim() === '') {
      setFormError('Indica el porcentaje de sobrecoste empresarial.');
      return;
    }

    setBusy(true);
    try {
      const { calculateHarvestCrew } = await loadEngine();

      setResult(
        calculateHarvestCrew(
          {
            workers: store.workers,
            days: store.days,
            province: store.province,
            category: store.category,
            ...(store.dailyWageOverrideEur.trim() !== ''
              ? { dailyWageOverrideEur: store.dailyWageOverrideEur }
              : {}),
            kgPerWorkerPerDay: store.kgPerWorkerPerDay,
            ...(store.machineryCostPerDayEur.trim() !== ''
              ? { machineryCostPerDayEur: store.machineryCostPerDayEur }
              : {}),
            ...(store.transportCostPerDayEur.trim() !== ''
              ? { transportCostPerDayEur: store.transportCostPerDayEur }
              : {}),
            employerCostMode: store.employerCostMode,
            ...(store.employerCostMode === 'manual' && store.employerCostPctManual.trim() !== ''
              ? { employerCostPctManual: store.employerCostPctManual }
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
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold text-olive-800">La cuadrilla</legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Trabajadores</span>
              <input
                className="field-input"
                type="text"
                inputMode="numeric"
                value={store.workers}
                onChange={(e) => store.set({ workers: e.target.value })}
                required
              />
            </label>

            <label className="block">
              <span className="field-label">Días de campaña</span>
              <input
                className="field-input"
                type="text"
                inputMode="numeric"
                value={store.days}
                onChange={(e) => store.set({ days: e.target.value })}
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Provincia</span>
            <select
              className="field-input"
              value={store.province}
              onChange={(e) => store.set({ province: e.target.value })}
            >
              {provinces.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="text-sm text-earth-600">
              El jornal se toma del convenio colectivo de esa provincia.
            </span>
          </label>

          <label className="block">
            <span className="field-label">Jornal diario (opcional)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.dailyWageOverrideEur}
              onChange={(e) => store.set({ dailyWageOverrideEur: e.target.value })}
              placeholder="Usar el del convenio"
            />
            <span className="text-sm text-earth-600">
              {officialWage
                ? 'Si lo rellenas, sustituye al valor publicado.'
                : 'El convenio de esta provincia aún no está confirmado: indícalo a mano.'}
            </span>
          </label>

          <label className="block">
            <span className="field-label">Kg recogidos por trabajador y día</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.kgPerWorkerPerDay}
              onChange={(e) => store.set({ kgPerWorkerPerDay: e.target.value })}
              required
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 border-t border-earth-200 pt-4">
          <legend className="text-lg font-semibold text-olive-800">Gastos</legend>

          <label className="block">
            <span className="field-label">Maquinaria por día (€)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.machineryCostPerDayEur}
              onChange={(e) => store.set({ machineryCostPerDayEur: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="field-label">Transporte por día (€)</span>
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={store.transportCostPerDayEur}
              onChange={(e) => store.set({ transportCostPerDayEur: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="field-label">Sobrecoste empresarial</span>
            <select
              className="field-input"
              value={store.employerCostMode}
              onChange={(e) => store.set({ employerCostMode: e.target.value as 'param' | 'manual' })}
            >
              <option value="param" disabled={!officialEmployerCost}>
                Usar el valor oficial
              </option>
              <option value="manual">Indicar el porcentaje</option>
            </select>
          </label>

          {!officialEmployerCost && (
            <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              El valor oficial del sobrecoste ({EMPLOYER_COST_PARAM}) todavía no está
              confirmado, así que por ahora hay que indicar el porcentaje a mano.
            </p>
          )}

          {store.employerCostMode === 'manual' && (
            <label className="block">
              <span className="field-label">Porcentaje de sobrecoste (%)</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={store.employerCostPctManual}
                onChange={(e) => store.set({ employerCostPctManual: e.target.value })}
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
            {busy ? 'Calculando…' : 'Calcular coste de la cuadrilla'}
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
          emptyHint="Rellena los datos de la cuadrilla y pulsa «Calcular»."
        />
      </div>
    </div>
  );
}

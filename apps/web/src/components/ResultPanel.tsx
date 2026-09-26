import { useState } from 'react';
import type { ResultSummary } from '../lib/types';
import { formatUpdatedAt } from '../lib/format';

/**
 * The result block of a tool page (spec §10.3): a big headline figure, a
 * collapsible step-by-step breakdown, and the warnings.
 *
 * Warnings are announced politely rather than as errors, because a warning
 * never invalidates a result (spec §4.3).
 */
type Props = {
  summary: ResultSummary | null;
  paramSetVersion: string;
  parametersUpdatedAt: string | null;
  /** Rendered when there is no result yet. */
  emptyHint: string;
  canSave?: boolean;
  onSave?: () => void;
};

export default function ResultPanel({
  summary,
  paramSetVersion,
  parametersUpdatedAt,
  emptyHint,
  canSave = false,
  onSave,
}: Props) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (summary === null) {
    return (
      <section className="card" aria-live="polite">
        <p className="text-earth-600">{emptyHint}</p>
      </section>
    );
  }

  const share = () => {
    const text = [summary.shareText ?? '', window.location.href]
      .filter(Boolean)
      .join('\n');
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        [summary.shareText ?? '', window.location.href].filter(Boolean).join('\n'),
      );
      setCopied(true);
      setTimeout(() => setBreakdownOpen((open) => open), 2000);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied; the WhatsApp button still works.
    }
  };

  return (
    <section className="card" aria-live="polite">
      <h2 className="text-lg font-semibold text-olive-800">{summary.headlineLabel}</h2>
      <p className="result-headline">{summary.headline}</p>

      {summary.figures.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {summary.figures.map((figure) => (
            <div key={figure.label}>
              <dt className="text-sm text-earth-600">{figure.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{figure.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {summary.warnings.length > 0 && (
        <ul className="mt-4 space-y-2" role="status">
          {summary.warnings.map((warning) => (
            <li
              key={warning.code}
              className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <strong className="font-semibold">Aviso:</strong> {warning.message}
              {warning.keys && warning.keys.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs underline">
                    Ver parámetros pendientes ({warning.keys.length})
                  </summary>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {warning.keys.map((key) => (
                      <li key={key}>{key}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {canSave && (
          <button type="button" className="btn btn-primary" onClick={onSave}>
            Guardar en mi cuenta
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={share}>
          Compartir por WhatsApp
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void copy();
          }}
        >
          {copied ? 'Copiado' : 'Copiar resultado'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={breakdownOpen}
          onClick={() => setBreakdownOpen((open) => !open)}
        >
          {breakdownOpen ? 'Ocultar' : 'Ver'} cómo se ha calculado
        </button>
      </div>

      {breakdownOpen && (
        <ol className="mt-4 space-y-2 border-t border-earth-200 pt-4 text-sm">
          {summary.breakdown.map((step, index) => (
            <li key={`${step.label}-${index}`} className="flex flex-wrap justify-between gap-2">
              <span className="text-earth-600">
                {step.label}
                {step.formula && (
                  <code className="ml-1 text-xs text-earth-600">({step.formula})</code>
                )}
              </span>
              <span className="font-medium tabular-nums">{step.value}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-xs text-earth-600">
        {formatUpdatedAt(parametersUpdatedAt)} · Parámetros {paramSetVersion} · Resultado
        orientativo, no sustituye el asesoramiento profesional.
      </p>
    </section>
  );
}

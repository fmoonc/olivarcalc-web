import { expect, test, type Page } from '@playwright/test';

/**
 * Every calculator, driven in a real browser (spec §14 Fase 3 acceptance).
 *
 * The expected numbers are the ones in the golden fixtures, so this suite fails
 * if a change to a formula, the formatting or the API contract moves a figure
 * the user sees. A server-side check cannot catch any of those three: the lazy
 * engine, the es-ES formatters and the Zustand island only exist here.
 *
 * Everything works without an account, and so does everything here: no login,
 * no cookies, no fixtures to seed.
 *
 * On the expected strings: Spanish grouping follows CLDR, which does not insert
 * a thousands separator below five digits. So `4796,00 €`, not `4.796,00 €`,
 * while `10.000,00 kg` does get one. That asymmetry reads like a typo and is not;
 * these literals are exactly what pin it.
 */

/**
 * `Intl.NumberFormat` puts a no-break space (U+00A0) between the amount and the
 * currency symbol, which is correct Spanish typography and must stay in the
 * product. Comparing that against a literal typed with an ordinary space fails
 * while looking like it should pass, so every read goes through here.
 */
function normalize(text: string): string {
  return text.replace(/ /g, ' ').trim();
}

/** The result panel's headline, which is the one number a grower came for. */
async function headline(page: Page): Promise<string> {
  return normalize(await page.locator('.result-headline').innerText());
}

/** Presses the submit button and waits for a result to appear. */
async function calculate(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await expect(page.locator('.result-headline')).toBeVisible();
}

/**
 * Presses submit and waits for the form to report a problem instead.
 *
 * `calculate` is deliberately the other half of this: several tools are
 * specified to refuse bad input, and for those a missing result is the point.
 */
async function submitExpectingAlert(page: Page, label: RegExp): Promise<string> {
  await page.getByRole('button', { name: label }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  return normalize(await alert.innerText());
}

/** The secondary figures listed in the result panel. */
async function figures(page: Page): Promise<string[]> {
  return (await page.locator('dl dd').allInnerTexts()).map(normalize);
}

/**
 * Opens a tool page and waits for its form to be there and ready.
 *
 * `page.goto()` resolves on load, which is not the same as the SSR markup being
 * in the DOM, and Astro's dev server is slower to produce the first request than
 * the built site is. Without this, a test that starts filling immediately sees
 * "element(s) not found" — which made this suite fail roughly one run in three
 * while passing in isolation every single time.
 */
async function openTool(page: Page, path: string): Promise<void> {
  await page.goto(path);
  // Enabled rather than merely visible, so this also covers the hydration gate
  // from ADR-0010 and a fill cannot race the island taking over.
  await expect(page.locator('.field-input').first()).toBeEnabled();
}

/**
 * Playwright gives each test a fresh browser context, so `localStorage` already
 * starts empty. Clearing it via `addInitScript` as well would run on *every*
 * navigation, including the reloads the persistence test depends on.
 */

test.describe('hidratación', () => {
  /**
   * Regression, and the reason this suite exists at all.
   *
   * Astro server-renders the island, so the form is on screen before React
   * takes over. The inputs are controlled by the Zustand store, and hydration
   * replaces the store with what it rehydrates from `localStorage` — empty on a
   * first visit. Anything typed in between was silently discarded, which is
   * precisely the mid-range phone on patchy coverage that spec §10.5 targets.
   *
   * The form is disabled until the island is ready, so the loss cannot happen.
   */
  test('the form cannot be typed into before the island is ready', async ({ page }) => {
    // Hydration finishes in milliseconds on localhost, far too fast to observe
    // directly, so the island's module is held back. This is also the timing a
    // farmer on a slow connection actually sees.
    await page.route('**/SettlementCalculator.tsx*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto('/herramientas/liquidacion-aceituna');

    // Not openTool(): this test is about the state BEFORE hydration, and
    // openTool deliberately waits for the form to become editable.
    // Server-rendered HTML is present immediately...
    await expect(page.getByLabel('Kilos de aceituna')).toBeVisible();

    // ...but not editable, and it says why rather than eating the input.
    await expect(page.getByLabel('Kilos de aceituna')).toBeDisabled();
    await expect(page.getByText('Preparando la calculadora…')).toBeVisible();

    // Once hydrated the very same field takes input and the notice is gone.
    await expect(page.getByLabel('Kilos de aceituna')).toBeEnabled();
    await expect(page.getByText('Preparando la calculadora…')).toHaveCount(0);
  });

  test('nothing typed before hydration is lost', async ({ page }) => {
    await openTool(page, '/herramientas/liquidacion-aceituna');
    await expect(page.getByLabel('Kilos de aceituna')).toBeEnabled();

    await page.getByLabel('Kilos de aceituna').fill('10000');
    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');

    // Give hydration every chance to clobber the store.
    await page.waitForTimeout(500);

    await expect(page.getByLabel('Kilos de aceituna')).toHaveValue('10000');
    await expect(page.getByLabel('Rendimiento graso total (%)')).toHaveValue('18.5');
  });
});

test.describe('calculadora de liquidación', () => {
  test('reproduces the golden fixture', async ({ page }) => {
    await openTool(page, '/herramientas/liquidacion-aceituna');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Liquidación');

    await page.getByLabel('Kilos de aceituna').fill('10000');
    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page.getByLabel('Índice corrector (puntos)').fill('3');
    await page.getByLabel('Precio del aceite por kilo (aceituna de vuelo)').fill('3.20');
    await page.getByLabel('Costes de almazara por kilo de aceituna').fill('0.06');

    await calculate(page, /Calcular liquidación/);

    // Fixture `settlement.json` / "single delivery, oil price, REAGP, IRPF".
    expect(await headline(page)).toBe('4796,00 €');

    expect(await figures(page)).toEqual(
      expect.arrayContaining([
        '10.000,00 kg', // totalKgOlives
        '1550,00 kg', // totalKgOil
        '1692,1 L', // litersOil
        '15,50 %', // avgIndustrialYieldPct
        '4360,00 €', // taxableBase
        '523,20 €', // vatAmount
        '87,20 €', // withholding
        '0,48 €', // effectivePricePerKgOlive
      ]),
    );
  });

  test('warns instead of failing when a parameter is unverified', async ({ page }) => {
    await openTool(page, '/herramientas/liquidacion-aceituna');

    await page.getByLabel('Kilos de aceituna').fill('10000');
    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page.getByLabel('Precio del aceite por kilo (aceituna de vuelo)').fill('3.20');
    await page.getByLabel('Costes de almazara por kilo de aceituna').fill('0.06');

    await calculate(page, /Calcular liquidación/);

    // Spec §4.3: a warning is never an error, and the result still comes back.
    await expect(page.getByText('pendientes de verificación')).toBeVisible();
    await expect(page.getByText('Aviso:').first()).toBeVisible();
    expect(await headline(page)).not.toBe('—');
  });

  test('the general VAT regime returns a figure instead of failing', async ({ page }) => {
    // Spec §0.2 left `vat.olive_general_rate_pct` empty, so until it was
    // confirmed a grower paying under the general regime got an error instead of
    // a settlement. It now reads 10 % from Ley 37/1992 art. 91.Uno, and this test
    // is what stops that from silently going back to an empty parameter.
    await openTool(page, '/herramientas/liquidacion-aceituna');

    await page.getByLabel('Kilos de aceituna').fill('10000');
    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page.getByLabel('Índice corrector (puntos)').fill('3');
    await page.getByLabel('Precio del aceite por kilo (aceituna de vuelo)').fill('3.20');
    await page.getByLabel('Costes de almazara por kilo de aceituna').fill('0.06');
    await page.getByLabel('Régimen de IVA').selectOption('general');

    await calculate(page, /Calcular liquidación/);

    const shown = await figures(page);

    // 10 % of the 4.360,00 € base, against 12 % under REAGP.
    expect(shown).toContain('436,00 €');
    expect(shown).not.toContain('523,20 €');
  });

  test('rejects an empty form with a readable message', async ({ page }) => {
    await openTool(page, '/herramientas/liquidacion-aceituna');

    const message = await submitExpectingAlert(page, /Calcular liquidación/);

    expect(message).toMatch(/kilos de aceituna/i);
    await expect(page.locator('.result-headline')).toHaveCount(0);
  });

  test('reveals the step-by-step breakdown on demand', async ({ page }) => {
    await openTool(page, '/herramientas/liquidacion-aceituna');
    await page.getByLabel('Kilos de aceituna').fill('10000');
    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page.getByLabel('Precio del aceite por kilo (aceituna de vuelo)').fill('3.20');
    await page.getByLabel('Costes de almazara por kilo de aceituna').fill('0.06');

    await calculate(page, /Calcular liquidación/);
    await page.getByRole('button', { name: /Ver cómo se ha calculado/ }).click();

    // Spec §10.3: the breakdown is what earns trust in the figure. Scoped to the
    // list, because "Base imponible" also names a figure in the summary above.
    const steps = page.locator('ol', { hasText: 'Base imponible' });
    await expect(steps).toContainText('Base imponible');
    await expect(steps).toContainText('Neto a percibir');
  });

  test('keeps the form across a reload, so a dropped signal costs nothing', async ({ page }) => {
    await openTool(page, '/herramientas/liquidacion-aceituna');
    await expect(page.getByLabel('Kilos de aceituna')).toBeEnabled();
    await page.getByLabel('Kilos de aceituna').fill('12345');

    await page.reload();
    await expect(page.getByLabel('Kilos de aceituna')).toBeEnabled();

    await expect(page.getByLabel('Kilos de aceituna')).toHaveValue('12345');
  });
});

test.describe('conversor de rendimiento', () => {
  test('reproduces the golden fixture', async ({ page }) => {
    await openTool(page, '/herramientas/rendimiento-aceituna');

    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page.getByLabel('Índice corrector (puntos)').fill('3');
    await page.getByLabel('Kilos de aceituna').fill('10000');

    await calculate(page, /^Calcular$/);

    // Fixture `yield-converter.json` / "kg of olives to litres of oil".
    expect(await headline(page)).toBe('15,50 %');

    expect(await figures(page)).toEqual(
      expect.arrayContaining(['1550,00 kg', '1692,1 L', '6,45 kg', '5,91 kg']),
    );
  });

  test('answers the inverse question: olives needed for a target volume', async ({ page }) => {
    await openTool(page, '/herramientas/rendimiento-aceituna');

    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page.getByLabel('Índice corrector (puntos)').fill('3');
    await page.getByLabel('¿Qué quieres calcular?').selectOption('inverse');
    await page.getByLabel('Litros de aceite que necesitas').fill('2000');

    await calculate(page, /^Calcular$/);

    // Fixture `yield-converter.json` / "inverse mode": 11.819,35 kg.
    expect(await figures(page)).toEqual(expect.arrayContaining(['11.819,35 kg']));
  });

  test('explains itself when the industrial yield is zero', async ({ page }) => {
    await openTool(page, '/herramientas/rendimiento-aceituna');

    // A correction index above the fat yield clamps at zero rather than going
    // negative (fixture "correction index above fat yield").
    await page.getByLabel('Rendimiento graso total (%)').fill('3');
    await page.getByLabel('Índice corrector (puntos)').fill('5');
    await page.getByLabel('Kilos de aceituna').fill('5000');

    await calculate(page, /^Calcular$/);

    expect(await headline(page)).toBe('0,00 %');
    await expect(page.getByText('no se puede calcular el rendimiento inverso')).toBeVisible();
  });
});

test.describe('coste por hectárea', () => {
  /** The eleven lines of the "intensive irrigated grove" fixture, all of them. */
  const costLines: Array<[string, string]> = [
    ['Poda', '180'],
    ['Fertilización', '220'],
    ['Fitorosanidad', '90'],
    ['Riego', '150'],
    ['Recogida', '320'],
    ['Manejo del suelo', '60'],
    ['Maquinaria', '210'],
    ['Seguros', '45'],
    ['Cuotas de cooperativa', '35'],
    ['Otros', '20'],
    ['Depreciación', '70'],
  ];

  test('reproduces the golden fixture', async ({ page }) => {
    await openTool(page, '/herramientas/coste-olivar-hectarea');

    await page.getByLabel('Hectáreas').fill('10');
    await page.getByLabel('Aceituna por hectárea (kg)').fill('4000');
    await page.getByLabel('Rendimiento industrial (%)').fill('15');
    await page.getByLabel('Precio del aceite por kilo').fill('3.20');

    for (const [label, value] of costLines) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }

    await calculate(page, /Calcular coste y margen/);

    // Fixture `cost-per-hectare.json` / "intensive irrigated grove".
    expect(await headline(page)).toBe('520,00 €');

    expect(await figures(page)).toEqual(
      expect.arrayContaining([
        '1400,00 €', // totalCostPerHa
        '14.000,00 €', // totalCost
        '600,00 kg', // kgOilPerHa
        '1920,00 €', // revenuePerHa
        '0,35 €', // costPerKgOlive
        '2,33 €', // costPerKgOil
        '2,33 €', // breakEvenOilPrice
      ]),
    );
  });

  test('breaks the cost down by line', async ({ page }) => {
    await openTool(page, '/herramientas/coste-olivar-hectarea');

    await page.getByLabel('Hectáreas').fill('10');
    await page.getByLabel('Aceituna por hectárea (kg)').fill('4000');
    await page.getByLabel('Rendimiento industrial (%)').fill('15');
    await page.getByLabel('Precio del aceite por kilo').fill('3.20');
    await page.getByLabel('Poda', { exact: true }).fill('180');
    await page.getByLabel('Fertilización', { exact: true }).fill('220');

    await calculate(page, /Calcular coste y margen/);

    // Only the filled lines appear; the empty ones count as zero (§4.6).
    const breakdown = page.locator('section', { hasText: 'Reparto de costes' });
    await expect(breakdown).toBeVisible();
    await expect(breakdown.getByText('Poda', { exact: true })).toBeVisible();
    await expect(breakdown.getByText('Maquinaria', { exact: true })).toHaveCount(0);
    // Read and normalize: the amount carries a no-break space before the €.
    expect(normalize(await breakdown.innerText())).toContain('Total: 400,00 € €/ha');
  });
});

test.describe('coste de la cuadrilla', () => {
  /**
   * Fills the crew form the way a real user has to today: the provincial wage
   * and the employer cost are both seeded empty per spec §0.2, so the manual
   * path is the only one available (ADR-0009).
   */
  async function fillCrew(page: Page, opts: { wage?: string; employerCost?: string } = {}) {
    await openTool(page, '/herramientas/coste-cuadrilla-recogida');
    await page.getByLabel('Trabajadores').fill('6');
    await page.getByLabel('Días de campaña').fill('12');
    if (opts.wage !== undefined) {
      await page.getByLabel('Jornal diario (opcional)').fill(opts.wage);
    }
    await page.getByLabel('Kg recogidos por trabajador y día').fill('400');
    await page.getByLabel('Sobrecoste empresarial').selectOption('manual');
    if (opts.employerCost !== undefined) {
      await page.getByLabel('Porcentaje de sobrecoste (%)').fill(opts.employerCost);
    }
  }

  test('reproduces the golden fixture with manual inputs', async ({ page }) => {
    await fillCrew(page, { wage: '60', employerCost: '30' });
    await page.getByLabel('Maquinaria por día (€)').fill('120');
    await page.getByLabel('Transporte por día (€)').fill('45');

    await calculate(page, /Calcular coste de la cuadrilla/);

    // Fixture `harvest-crew.json` / "param-driven employer cost, full equipment".
    expect(await headline(page)).toBe('0,26 €');

    expect(await figures(page)).toEqual(
      expect.arrayContaining([
        '7596,00 €', // total
        '60,00 €', // dailyWage
        '4320,00 €', // wagesTotal
        '1296,00 €', // employerCost
        '1980,00 €', // opsTotal
        '28.800,00 kg', // kgHarvested
      ]),
    );
  });

  test('always carries the fixed disclaimer of spec §4.7', async ({ page }) => {
    await fillCrew(page, { wage: '60', employerCost: '30' });
    await calculate(page, /Calcular coste de la cuadrilla/);

    await expect(page.getByText('Estimación orientativa')).toBeVisible();
    await expect(page.getByText(/Consulta con tu gestoría/)).toBeVisible();
  });

  test('asks for the daily wage while the convenio is unverified', async ({ page }) => {
    // No wage filled: the island must ask up front instead of failing deep in
    // the engine once the whole form is filled (ADR-0009).
    await fillCrew(page, { employerCost: '30' });

    const message = await submitExpectingAlert(page, /Calcular coste de la cuadrilla/);

    expect(message).toMatch(/jornal/i);
    await expect(page.locator('.result-headline')).toHaveCount(0);
  });

  test('disables the official employer cost while it is unverified', async ({ page }) => {
    // Not openTool(): the option below has to be observed in the server-rendered
    // markup, before React attaches.
    await page.goto('/herramientas/coste-cuadrilla-recogida');

    const option = page
      .getByLabel('Sobrecoste empresarial')
      .locator('option', { hasText: 'Usar el valor oficial' });

    // Seeded empty per spec §0.2, so this option is unavailable.
    await expect(option).toBeDisabled();

    // And the grower is told which parameter is missing, by name.
    await expect(
      page.getByRole('status').filter({ hasText: 'labor.employer_cost_pct' }),
    ).toBeVisible();
  });
});

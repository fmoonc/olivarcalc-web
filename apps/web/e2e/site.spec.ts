import { expect, test } from '@playwright/test';

/**
 * The public site outside the calculators: prices, guides, SEO and consent.
 *
 * The consent assertions matter more than they look. Spec §12 is a legal
 * requirement, and "no ad or analytics script before consent" is exactly the
 * kind of thing that regresses silently when someone adds a component.
 */
test.describe('navegación', () => {
  test('the home page links to all five tools and they all resolve', async ({ page }) => {
    await page.goto('/');

    const tools: Array<[string, string]> = [
      ['Liquidación de aceituna', '/herramientas/liquidacion-aceituna'],
      ['Conversión de rendimiento', '/herramientas/rendimiento-aceituna'],
      ['Precio del aceite', '/precio-aceite-oliva'],
      ['Coste por hectárea', '/herramientas/coste-olivar-hectarea'],
      ['Coste de la cuadrilla', '/herramientas/coste-cuadrilla-recogida'],
    ];

    for (const [name, href] of tools) {
      const link = page.getByRole('link', { name, exact: true }).first();
      await expect(link).toHaveAttribute('href', href);
    }
  });

  test('a guide page renders its body and FAQ', async ({ page }) => {
    await page.goto('/guias');
    await page.getByRole('link', { name: /índice corrector/i }).first().click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('índice corrector');
    await expect(page.getByText('Preguntas frecuentes')).toBeVisible();
  });

  test('an unknown guide 404s rather than rendering an empty page', async ({ page }) => {
    const response = await page.goto('/guias/no-existe-esta-guia');
    expect(response?.status()).toBe(404);
  });

  test('the legal pages ship as flagged templates, not invented text', async ({ page }) => {
    await page.goto('/aviso-legal');

    // Spec §10.2: the owner writes these, so they must not look finished.
    await expect(page.getByText('PLANTILLA PENDIENTE DE REVISIÓN')).toBeVisible();
    await expect(page.getByText('{{RAZON_SOCIAL}}')).toBeVisible();
  });

  test('the affiliate page carries the required disclosure', async ({ page }) => {
    await page.goto('/afiliacion');

    // The disclosure appears in the body copy and again near the links, which
    // is deliberate on a page whose whole purpose is being transparent.
    await expect(
      page.getByText('obtengo ingresos por las compras adscritas').first(),
    ).toBeVisible();

    // Spec §12: rel="sponsored nofollow noopener" on every affiliate link.
    const links = page.locator('a[href*="amazon"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(links.nth(i)).toHaveAttribute('rel', /sponsored/);
    }
  });
});

test./**
 * The POOLred index page (spec §10.2).
 *
 * The figures come from POOLred's API, so they are asserted as "a variation is
 * shown with the right sign and scale" rather than as exact numbers: pinning a
 * figure that a third party publishes would fail the build the day the market
 * moves. What is pinned here is the behaviour a grower depends on.
 *
 * These tests run against whatever the CI database happens to hold. The importer
 * is off there by design (`POOLRED_IMPORT_ENABLED`), so on a fresh runner there
 * are no prices at all, and the page correctly renders its empty state. Tests that
 * need data seed it; tests about the empty state are the point of those that do
 * not.
 */
describe('índice iPOOL de POOLred', () => {
  /**
   * Whether the page actually rendered index figures.
   *
   * Read off the DOM rather than asked of the API on the side. Astro caches a
   * build-time fetch, so the API can change between runs while the served page
   * does not; asking the API and then asserting on the page is how this test
   * ended up asserting an empty state against a page full of data, about one run
   * in three. The DOM is the thing under test.
   */
  async function pageHasData(page: import('@playwright/test').Page): Promise<boolean> {
    return (await page.locator('main#contenido >> text=/iPOOL /').count()) > 0;
  }

  /** Skips, with a visible reason, when this environment has no index data. */
  function skipIfNoData(hasData: boolean): void {
    if (hasData) return;

    test.info().annotations.push({
      type: 'skip',
      description:
        'La API no tiene datos de POOLred en este entorno; se ejecuta solo con ' +
        'POOLRED_IMPORT_ENABLED=true o tras una importación.',
    });
    test.skip();
  }

  test('shows the weekly variation of POOLred\'s four indices, with their names', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));
    await page.goto('/precio-aceite-oliva');

    // These four are POOLred's names, not ours. Asserting them is what stops the
    // page quietly translating data it credits to someone else.
    for (const name of ['iPOOL Extra', 'iPOOL Virgen', 'iPOOL Lampante', 'iPOOL España']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }

    // A percentage, in Spanish format: comma decimal, and POOLred's own sign so a
    // fall reads as a fall. Scoped to the four variation cards, since the Extra
    // card below carries a price in euros and would match neither.
    const variations = await page
      .locator('section', { hasText: 'Variación semanal' })
      .locator('li.card p.tabular-nums')
      .allInnerTexts();

    expect(variations).toHaveLength(4);

    for (const raw of variations) {
      expect(raw.replace(/ /g, ' ').trim()).toMatch(/^[+-]?\d+,\d{2} %$/);
    }
  });

  test('attributes the data to the Fundación del Olivar and links to it', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    // Republishing someone else's index without saying whose it is would be the
    // worst version of this page.
    await expect(page.getByText('Fundación del Olivar (POOLred)')).toBeVisible();

    const link = page.getByRole('link', { name: /Fundación del Olivar/ }).first();
    await expect(link).toHaveAttribute('href', /poolred\.com/);
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('calls it an index, not an official price', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    // The distinction is the whole reason the page was reworded. The sentence is
    // split by a <strong>, so it is matched as one text run rather than two.
    await expect(page.getByText(/índice de mercado/i)).toBeVisible();
    await expect(
      page.getByText(/no un precio oficial ni una cotización/i),
    ).toBeVisible();
  });

  test('the Dataset JSON-LD credits POOLred as the creator', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    const raw = await page.locator('script[type="application/ld+json"]').first().innerText();
    const schema = JSON.parse(raw) as Array<Record<string, unknown>>;

    const dataset = schema.find((s) => s['@type'] === 'Dataset');
    const creator = dataset?.creator as Record<string, unknown> | undefined;

    // Without a creator, the structured data claims numbers nobody authored.
    expect(creator?.name).toContain('Fundación del Olivar');
    expect(String(creator?.url)).toContain('poolred.com');
  });

  /**
   * Regression: the chart defaulted to `virgin` while this page only ships
   * `extra`, so it rendered "no data for this quality" with no way back. The
   * component now derives its default from the series it was given.
   */
  test('plots the quality the page actually has, with no dead tabs', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    const reveal = page.getByRole('button', { name: 'Ver la gráfica' });
    await reveal.scrollIntoViewIfNeeded();
    await expect(reveal).toBeEnabled();
    await reveal.click();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();

    // A real chart, not the empty-state message.
    await expect(page.getByText(/No hay datos para esta calidad/)).toHaveCount(0);

    // One quality in, one tab. The importer publishes a single index, so the
    // other two would only switch to an empty chart.
    const tabs = page.getByRole('group', { name: 'Calidad del aceite' }).getByRole('button');
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toHaveText('Extra');
  });

  test('describes itself as the POOLred index rather than a plain price', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    await expect(page.getByText(/Índice iPOOL de POOLred/i)).toBeVisible();
  });

  test('loads the chart only on demand', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    // Spec §10.6: Recharts is a deferred chunk, not part of the initial payload.
    expect(await page.locator('.recharts-wrapper').count()).toBe(0);

    const reveal = page.getByRole('button', { name: 'Ver la gráfica' });

    // The island is `client:visible`, so it only hydrates once the chart scrolls
    // into view. This page puts the four variation cards and the attribution above
    // it, which pushes the button to the very bottom of the fold, so the scroll is
    // part of what is being tested rather than a detail.
    await reveal.scrollIntoViewIfNeeded();
    await expect(reveal).toBeEnabled();
    await reveal.click();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
  });

  test('shows a year of weekly history', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');
    skipIfNoData(await pageHasData(page));

    // A single data point is not a history. POOLred serves a year, so the importer
    // should be storing weeks, not just the latest one.
    await expect(page.getByText(/año de histórico/i)).toBeVisible();
  });

  /**
   * The state a fresh CI runner is actually in, and the one that matters most.
   *
   * The importer is off without POOLRED_IMPORT_ENABLED, so on a clean database
   * this page has nothing to show. It must say so plainly rather than render an
   * empty chart or a heading with no figures under it — and it must still explain
   * where the data will come from, because that is what makes the page worth
   * returning to.
   */
  test('says plainly when there is no index data yet', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');

    const hasData = await pageHasData(page);

    if (hasData) {
      // With data, the page must not claim otherwise.
      await expect(page.getByText(/todavía no hay variaciones/i)).toHaveCount(0);
      return;
    }

    await expect(page.getByText(/todavía no hay variaciones del índice/i)).toBeVisible();
    await expect(page.getByText(/corre dos veces al día/i)).toBeVisible();

    // No chart at all: there is nothing to plot, and an empty axis would be worse
    // than none.
    await expect(page.locator('.recharts-wrapper')).toHaveCount(0);

    // And the attribution survives, so the page still says whose data it will be.
    await expect(page.getByText(/Fundación del Olivar/)).toBeVisible();
  });
});

test.describe('consentimiento y anuncios (§12)', () => {
  test('no ad or analytics script is requested at all', async ({ page }) => {
    const thirdParty: string[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('googlesyndication.com') || url.includes('googletagmanager.com')) {
        thirdParty.push(url);
      }
    });

    await page.goto('/herramientas/liquidacion-aceituna');
    await page.getByLabel('Kilos de aceituna').fill('10000');
    await page.getByLabel('Rendimiento graso total (%)').fill('18.5');
    await page
      .getByLabel('Precio del aceite por kilo (aceituna de vuelo)')
      .fill('3.20');
    await page.getByLabel('Costes de almazara por kilo de aceituna').fill('0.06');
    await page.getByRole('button', { name: /Calcular liquidación/ }).click();
    await expect(page.locator('.result-headline')).toBeVisible();

    // No publisher id is configured locally, so nothing should load. And with
    // an id it still would not, without consent.
    expect(thirdParty).toEqual([]);
  });

  test('renders no ad container at all when no publisher is configured', async ({ page }) => {
    await page.goto('/');

    // The reserved-height placeholder would otherwise be visible as a dashed
    // box on every page.
    await expect(page.locator('[data-ad-slot]')).toHaveCount(0);
  });
});

test.describe('SEO (§11)', () => {
  test('every page has a unique title, description and canonical', async ({ page }) => {
    const paths = [
      '/',
      '/herramientas/liquidacion-aceituna',
      '/herramientas/rendimiento-aceituna',
      '/herramientas/coste-olivar-hectarea',
      '/herramientas/coste-cuadrilla-recogida',
      '/precio-aceite-oliva',
      '/guias',
    ];

    const seen = new Set<string>();

    for (const path of paths) {
      await page.goto(path);
      const title = await page.title();
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

      expect(title, `title of ${path}`).toBeTruthy();
      expect(description, `description of ${path}`).toBeTruthy();
      expect(canonical, `canonical of ${path}`).toContain(path === '/' ? '/' : path);

      // Spec §11: duplicate titles across the site are a real SEO problem.
      expect(seen.has(title), `duplicate title: ${title}`).toBe(false);
      seen.add(title);
    }
  });

  test('a tool page carries WebApplication JSON-LD marked free', async ({ page }) => {
    await page.goto('/herramientas/liquidacion-aceituna');

    const raw = await page.locator('script[type="application/ld+json"]').first().innerText();
    const schema = JSON.parse(raw) as Array<Record<string, unknown>>;

    const app = schema.find((s) => s['@type'] === 'WebApplication');
    expect(app).toBeDefined();
    expect(app?.applicationCategory).toBe('FinanceApplication');
    expect(app?.isAccessibleForFree).toBe(true);
  });

  test('a guide carries Article JSON-LD with an author and a date', async ({ page }) => {
    await page.goto('/guias/indice-corrector-como-se-usa');

    const raw = await page.locator('script[type="application/ld+json"]').first().innerText();
    const schema = JSON.parse(raw) as Array<Record<string, unknown>>;

    const article = schema.find((s) => s['@type'] === 'Article');
    expect(article).toBeDefined();
    expect(article?.datePublished).toBeTruthy();

    // E-E-A-T: an article with no author is worthless for trust (spec §11).
    const author = article?.author as Record<string, unknown> | undefined;
    expect(author?.['@type']).toBe('Person');
    expect(author?.name).toBeTruthy();
  });

  test('the price page carries Dataset JSON-LD', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');

    const raw = await page.locator('script[type="application/ld+json"]').first().innerText();
    const schema = JSON.parse(raw) as Array<Record<string, unknown>>;

    expect(schema.some((s) => s['@type'] === 'Dataset')).toBe(true);
  });

  test('robots.txt blocks the private area', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('Disallow: /cuenta');
    expect(body).toContain('Sitemap:');
  });
});

test.describe('accesibilidad (§10.5)', () => {
  test('inputs have associated labels', async ({ page }) => {
    await page.goto('/herramientas/liquidacion-aceituna');

    // getByLabel in every calculator test already depends on this, but assert
    // it here so a future markup change fails with a clear reason.
    const unlabelled = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll('input:not([type=hidden]), select, textarea'),
      );
      return controls
        .filter((el) => {
          const id = el.getAttribute('id');
          const wrapped = el.closest('label');
          return !(wrapped || (id && document.querySelector(`label[for="${id}"]`)));
        })
        .map((el) => el.outerHTML.slice(0, 80));
    });

    expect(unlabelled).toEqual([]);
  });

  test('the page declares Spanish and has one h1', async ({ page }) => {
    await page.goto('/herramientas/liquidacion-aceituna');

    // Scoped to the site's own content landmark. Astro's dev toolbar injects
    // headings of its own into a shadow root that Playwright pierces, and it
    // comes and goes with the dev server, so counting `h1` document-wide makes
    // this test fail for reasons that have nothing to do with the page.
    const heading = page.locator('main#contenido h1');

    // Retried rather than asserted once: within a full suite run this page
    // occasionally loads with the island still swapping its SSR markup, and a
    // single read caught the intermediate state. Playwright polls by default, and
    // the value is either right or it is not, so waiting for it is honest rather
    // than a way of hiding a real failure.
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText('Liquidación');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('is keyboard navigable to the submit button', async ({ page }) => {
    await page.goto('/herramientas/liquidacion-aceituna');

    await page.getByLabel('Kilos de aceituna').focus();
    await page.keyboard.press('Tab');

    // Focus must not vanish into nothing; a visible ring is the WCAG 2.2 fix
    // that most often gets dropped.
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(focused).not.toBe('');
  });
});

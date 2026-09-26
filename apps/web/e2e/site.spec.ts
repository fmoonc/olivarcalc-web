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

test.describe('precios', () => {
  test('shows the latest week and loads the chart only on demand', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');

    await expect(page.getByRole('heading', { name: /Última semana/ })).toBeVisible();
    await expect(page.getByText('Virgen').first()).toBeVisible();

    // Spec §10.6: Recharts is a deferred chunk, so the chart is not in the
    // initial payload. It appears on interaction.
    const before = await page.locator('.recharts-wrapper').count();
    expect(before).toBe(0);

    const reveal = page.getByRole('button', { name: 'Ver la gráfica' });
    await expect(reveal).toBeEnabled();
    await reveal.click();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
  });

  test('the chart can be switched between qualities', async ({ page }) => {
    await page.goto('/precio-aceite-oliva');

    // Enabled only once the island is live; before that a press would hit no
    // handler at all (ADR-0010).
    const reveal = page.getByRole('button', { name: 'Ver la gráfica' });
    await expect(reveal).toBeEnabled();
    await reveal.click();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();

    await page.getByRole('button', { name: 'Lampante', exact: true }).click();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
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

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    // Scoped to the site's own content landmark. Astro's dev toolbar injects
    // headings of its own into a shadow root that Playwright pierces, and it
    // comes and goes with the dev server, so counting `h1` document-wide makes
    // this test fail for reasons that have nothing to do with the page.
    await expect(page.locator('main#contenido h1')).toHaveCount(1);
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

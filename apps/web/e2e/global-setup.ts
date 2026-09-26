/**
 * The Astro build reads the parameter set at build time and fails without it
 * (spec §10.1), so an API that is down turns every test into a timeout with a
 * confusing message. Check once, up front, and say what to do.
 *
 * Uses `fetch` rather than Playwright's `request`: the API object needs a
 * context built first, which is noise for a single health probe.
 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8000';

async function reachable(path: string): Promise<number> {
  const response = await fetch(`${API_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
  });

  return response.status;
}

export default async function globalSetup(): Promise<void> {
  try {
    const status = await reachable('/up');
    if (status >= 500) {
      throw new Error(`HTTP ${status} from /up`);
    }
  } catch (error) {
    throw new Error(
      `The OlivarCalc API is not answering at ${API_URL} (${String(error)}).\n` +
        'Astro fetches the parameter set during the build and fails on purpose\n' +
        '(spec §10.1), so every E2E test would time out instead of failing clearly.\n\n' +
        'Start it with:\n' +
        '  cd ../olivarcalc-api && make serve\n\n' +
        'And publish a parameter set if you have not:\n' +
        '  php artisan parameters:publish --force',
    );
  }

  // A published set is what the calculators read. Without one the pages render
  // but the engine has no parameters, and every figure would be wrong.
  if ((await reachable('/api/v1/parameters/current')) === 404) {
    throw new Error(
      'No parameter set is published, so the calculators have nothing to read.\n' +
        'Run:  php artisan parameters:publish --force',
    );
  }
}

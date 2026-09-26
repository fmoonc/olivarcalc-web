import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (spec §14 Fase 3).
 *
 * These drive a real browser because that is the only place the lazy calculation
 * engine, the Zustand persistence and the result panel actually run. Every other
 * check in this repo is server-side: rendering, HTTP status, and fixture
 * comparisons. Without this, "the calculator works" is an untested assumption.
 *
 * The suite needs the API up, because Astro fetches the parameter set at build
 * time and fails without it (spec §10.1). `webServer` starts Astro; the API is
 * expected to be running, and `checkApi` below says so clearly if it is not.
 */
const WEB_PORT = 4321;
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Shared localStorage-free pages and a dev server: parallel workers just
  // compete for the same port and make failures harder to read.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'yarn dev',
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    env: {
      // Turns off Astro's dev toolbar, development chrome that would otherwise
      // leak into assertions. See astro.config.mjs.
      OLIVARCALC_E2E: '1',
    },
  },

  /**
   * Fails fast with an actionable message instead of a wall of timeouts when
   * the API is down, which is the single most common way to run this suite
   * wrong.
   */
  globalSetup: './e2e/global-setup.ts',
});

export { API_URL };

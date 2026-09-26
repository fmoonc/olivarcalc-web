// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [react(), sitemap()],
  /**
   * The dev toolbar injects its own DOM inside a shadow root that Playwright
   * pierces, so it turns up in assertions about the page's headings and
   * landmarks. It is development chrome and is never part of the built site.
   */
  devToolbar: { enabled: !process.env.OLIVARCALC_E2E },
  build: {
    // Spec §10.6: a tool page must stay under 90 KB gzip of JS.
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Surface a budget breach at build time rather than in Lighthouse CI.
      chunkSizeWarningLimit: 90,
    },
  },
});

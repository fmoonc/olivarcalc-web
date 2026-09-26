// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [react(), sitemap()],
  build: {
    // Spec §10.6: a tool page must stay under 90 KB gzip of JS.
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      // Surface a budget breach at build time rather than in Lighthouse CI.
      chunkSizeWarningLimit: 90,
    },
  },
});

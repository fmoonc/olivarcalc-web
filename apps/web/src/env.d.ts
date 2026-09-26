/// <reference types="astro/client" />

/**
 * Build-time environment, per spec §13.4.
 *
 * Declared here so `import.meta.env` is typed instead of `any`: without this,
 * every read is an unchecked assignment and a typo in a variable name is
 * silently `undefined` at build time.
 */
interface ImportMetaEnv {
  /** Server-side only. Used to fetch during the build; never shipped. */
  readonly API_URL?: string;
  /** Public API base, used by the browser. */
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SITE_NAME?: string;
  /** Empty in local and staging, so no ad script is injected at all. */
  readonly PUBLIC_ADSENSE_CLIENT?: string;
  readonly ADSENSE_PUBLISHER_ID?: string;
  readonly PUBLIC_GA4_ID?: string;
  readonly PUBLIC_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

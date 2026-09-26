# Reserved, not created on purpose

The Expo app is **out of the MVP** (spec §3.1, §15). Do not scaffold anything
here until the owner decides to start that phase.

When it happens, these are the constraints it must respect, and they only hold if
`@olivar/calculations` stayed free of browser APIs:

- The formulas run on Hermes, so no `document`, `window`, `localStorage` or
  system clock inside `packages/calculations`.
- Auth uses a Sanctum **bearer token**, not cookies: everything the web does must
  also be possible with a token.
- `GET /v1/parameters/current` must keep returning `version` and `published_at`
  so the app can show "valores a fecha X" and work offline.
- The Laravel endpoints for Google (`id_token`) and account deletion already
  exist; Sign in with Apple is a prepared 501.

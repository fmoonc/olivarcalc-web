# DECISIONS — olivarcalc-web

Registro de decisiones no triviales (spec §0.5). El equivalente de la API
está en `../olivarcalc-api/DECISIONS.md`.

---

## ADR-0001 — TypeScript 5.9, not 7.0.2

**Contexto.** Spec §0.4 pide la última versión estable. A día de hoy la última
es TypeScript 7.0.2 (el port nativo en Go). Se probó y compila: `tsc --strict`
con `big.js` pasa sin avisos.

**Decisión.** Fijar TypeScript 5.9.3.

**Consecuencias.** `typescript-eslint` declara `typescript: ">=4.8.4 <6.1.0"`,
y **ninguna** versión lo admite: ni la estable 8.70.1 ni el canary
`8.70.2-alpha.10`. Con TS 7 habría que renunciar al lint con tipos, y en este
proyecto esas reglas importan: `@typescript-eslint/no-unsafe-assignment` y
`no-unsafe-member-access` son la red que atrapa el dinero tratado como `float`
(spec §0.7). Perderlas para ganar un número de versión no sale a cuenta.

Revisar cuando `typescript-eslint` abra el rango a 7.x.

---

## ADR-0002 — orval's react-query client ignores the mutator

**Contexto.** Spec §15 exige que `@olivar/api-client` funcione con un `fetch`
inyectable, para que la futura app móvil añada el token Sanctum sin tocar código
generado. orval 8.37 no honra `override.mutator` con `client: 'react-query'`:
genera un `fetch(...)` global.

**Decisión.** Dejar el `mutator` comentado en `orval.config.ts` con un TODO que
apunta aquí, en vez de una config que aparenta funcionar. `src/fetcher.ts`
existe, es correcto y está tipado; simplemente los hooks generados todavía no
lo usan.

**Consecuencias.** **No des por hecho que el `baseUrl` o las cabeceras de auth
de `apiFetcher` se estén aplicando.** Mientras tanto la base URL llega por
`PUBLIC_API_URL` en tiempo de build. Para el MVP (solo web, sin token) es
suficiente. Antes de la Fase de app móvil, esto es trabajo pendiente real: o se
soluciona el mutator, o se envuelve el cliente de TanStack Query a mano.

---

## ADR-0003 — Generated orval output lives under `src/generated/`

**Contexto.** `clean: true` borra **toda** la carpeta de salida. Con
`target: './src/generated.ts'` y `schemas: './src/model'`, la carpeta de salida
es `src/`, así que orval eliminaba el `fetcher.ts` escrito a mano en cada
generación.

**Decisión.** Apuntar la salida a `./src/generated/`, dejando `src/fetcher.ts` y
`src/index.ts` fuera de su alcance.

**Consecuencias.** El fallo era silencioso: el `import` del mutador desaparecía
y orval emitía código con `fetch` global, lo que parecía un problema de
configuración del mutador en vez de un borrado de ficheros. Si añades ficheros
a mano en `packages/api-client/src/`, mantenlos fuera de `generated/`.

---

## ADR-0004 — `apps/web` typecheck is `tsc`, not `astro check`

**Contexto.** `astro check` detecta que le falta `@astrojs/check` en el proyecto
y trata de instalarlo. En CI se niega ("Packages cannot be installed
automatically in CI environments") y sin `CI=1` se queda en un prompt
interactivo que cuelga el pipeline.

**Decisión.** `typecheck` es `tsc --noEmit`. Cubrir el frontmatter de `.astro`
queda para la Fase 3, cuando existan islas de React y el tipo importa de
verdad.

**Consecuencias.** Hoy solo se tipan `.ts`/`.tsx`. Cuando se añadan islas,
reevaluar: la alternativa es fijar las dependencias de forma que `astro check`
las encuentre y pararlo con `--minimumSeverity error` en un entorno no
interactivo.

---

## ADR-0005 — Yarn 4 con `nodeLinker: node-modules`

**Contexto.** Spec §3.1 pide Yarn 4 con `nodeLinker: node-modules` por
compatibilidad con Expo. Confirmado en la práctica: Yarn 4 es la LTS actual
(4.18.1) y su `npmMinimalAgeGate` de 1440 min bloquea paquetes publicados hace
menos de 24 h.

**Decisión.** Mantener lo que dice la spec.

**Consecuencias.** El gate de antigüedad **es una buena cosa**: durante el
arranque de este repo rechazaron dos dependencias por estar recién publicadas
(`@types/node@24.19.0` y `@tanstack/react-query@5.104.0`). La respuesta no es
desactivarlo sino ampliar el rango (`^24.0.0`, `^5.0.0`) para que Yarn elija la
versión más reciente que ya haya pasado el gate. Si `yarn install` falla con
"All versions satisfying X are quarantined", ese es el motivo.

---

## ADR-0008 — The calculation engine and Recharts load on demand

**Contexto.** Spec §10.6 caps a tool page at 90 KB gzip of JS. With a React 19
island the Astro client runtime alone is ~64 KB gzip, and zod (required by
§4.1) added ~30 KB more: the settlement page shipped at **100.9 KB**, over
budget.

**Decisión.** Keep zod, but `import('@olivar/calculations')` on the first
"Calcular" click, and `import('./PriceChartInner')` on first interaction with
the chart. Measured result: **75.1 KB initial**, 130.7 KB split across two lazy
chunks that no `modulepreload` pulls in.

**Consecuencias.** The budget is met and the calculator paints before its engine
arrives, which also helps LCP. The trade-off: the first click waits for a
chunk, so the button shows a "Calculando…" state. If a future Lighthouse run
counts total page bytes rather than the initial load, these chunks have to be
counted too — the split is worth revisiting then.

One related gotcha: Astro server-renders islands, and `zustand/persist`
resolves its storage eagerly. Without an explicit no-op storage on the server,
`localStorage` is undefined in Node, the store hydrates to nothing, and the SSR
pass crashes on `deliveries.length`.

---

## ADR-0007 — The API speaks snake_case, so `ParamSet` does too

**Contexto.** Spec §7.1 requires snake_case JSON and says explicitly "orval
puede mapear a camelCase si se configura; decidir y documentar en
`DECISIONS.md`". The `ParamSet` shape in this package was originally camelCase
(`sourceLabel`, `publishedAt`), which did not match what Laravel emits.

**Decisión.** snake_case for the two shapes the API actually serialises
(`ParamValue`, `ParamSet`). Calculation *results* stay camelCase, because they
never cross the wire: the API stores `results` as an opaque JSON blob and does
not parse it (spec §7.4), so there is no contract to satisfy.

**Consecuencias.** The alternative — having orval rename everything to camelCase
— was rejected because it depends on the transformer working, and ADR-0002
already established that orval's react-query client is not honouring our config
here. Building on a broken transformer would be building on sand.

A consequence worth remembering: `assertJsonPath('params.oil.density_kg_per_l')`
silently fails in Pest, because the dots in the key read as a nested path. Use
bracket access on the decoded JSON for any parameter key.

---

## ADR-0006 — El nodo se fija por proyecto con `.nvmrc`, no en el `default` de nvm

**Contexto.** La máquina tenía Node 18.13.0 como `default` de nvm, y hay otros
proyectos en `~/Desktop/www` que dependen de él. Astro 7 y Vitest 5 exigen
`node >=22.12.0`, y la LTS activa es Node 24.

**Decisión.** `nvm install 24` y `.nvmrc` con `24` en la raíz del monorepo,
**sin** tocar el alias `default` de nvm.

**Consecuencias.** Este repo usa Node 24 sin arrastrar a los demás. Cada shell
nuevo arranca con el `default` antiguo, así que hay que hacer `nvm use` antes
de trabajar aquí. `package.json` declara `"engines": { "node": ">=24.0.0" }`.

---

## ADR-0009 — An empty parameter is a real state, so the UI has to know about it

**Contexto.** Spec §0.2 forbids inventing official values, so
`labor.employer_cost_pct` and every `wages.<province>.<category>.daily_eur` are
seeded **empty** rather than given a plausible placeholder. That is the
intended behaviour, and it made the harvest crew calculator throw
`TypeError: Empty decimal` for every real user, after they had filled in the
whole form.

**Decisión.** Two layers.

1. `ParamReader.decimal()` throws an error that **names the parameter**:
   "El parámetro `labor.employer_cost_pct` todavía no tiene valor confirmado por
   el propietario." No stack trace, no "Empty decimal".
2. The harvest crew island **checks the paramSet it already holds** before
   calculating, disables the "use the official value" option, and asks for the
   manual figure up front.

**Consecuencias.** The calculator is usable today with manual inputs, and gets
better on its own as the owner verifies parameters — the option re-enables
itself with no code change. The pattern generalises: any calculator that needs a
seed-empty parameter should read it from the paramSet rather than discovering it
through an exception.

Verified end to end: the live API's paramSet, the golden fixtures and the values
the islands send all agree on 14 figures.

---

## ADR-0010 — Islands disable their form until hydrated, instead of trusting the server-rendered HTML

**Contexto.** Astro server-renders islands, so a tool page's form is on screen
and looks usable before React takes over. The inputs are controlled by the
Zustand store, and hydration replaces the store with whatever it rehydrates
from `localStorage` — empty on a first visit. **Anything the grower typed in
between was silently discarded**, with no error and no visual sign.

This was invisible to every check in the repo. `renderToString`, HTTP status
checks and fixture comparisons all run on the server, where the island never
hydrates. It took a Playwright test to find it.

**Decisión.** `useHydrated()` in `apps/web/src/lib/hydrated.ts`, used by all
four calculator islands **and the price chart**. Until the island is ready the
form is wrapped in a `disabled` fieldset and shows "Preparando la calculadora…".

The chart needed it too, same reason in a different costume: its "Ver la
gráfica" button carries no click handler before hydration, so a press did
nothing at all. Its buttons are individually `disabled`, since there is no form
to wrap.

A disabled fieldset is used rather than per-input `disabled` so each calculator
island needs one change, and `className="contents"` keeps the wrapper out of the
layout so the server-rendered and hydrated markup stay identical.

**Alternativa descartada.** `client:only` would remove the server render
entirely, at the cost of a blank form on slow connections and worse LCP — the
opposite of what spec §10.6 asks for.

**Consecuencias.** A farmer on a mid-range phone and patchy coverage, the
audience §10.5 names explicitly, sees a disabled form for a moment instead of
losing a kilo count they typed. The E2E suite now covers it, with the island's
module deliberately delayed so the pre-hydration state is observable rather
than a race.

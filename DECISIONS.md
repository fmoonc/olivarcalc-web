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

## ADR-0006 — El nodo se fija por proyecto con `.nvmrc`, no en el `default` de nvm

**Contexto.** La máquina tenía Node 18.13.0 como `default` de nvm, y hay otros
proyectos en `~/Desktop/www` que dependen de él. Astro 7 y Vitest 5 exigen
`node >=22.12.0`, y la LTS activa es Node 24.

**Decisión.** `nvm install 24` y `.nvmrc` con `24` en la raíz del monorepo,
**sin** tocar el alias `default` de nvm.

**Consecuencias.** Este repo usa Node 24 sin arrastrar a los demás. Cada shell
nuevo arranca con el `default` antiguo, así que hay que hacer `nvm use` antes
de trabajar aquí. `package.json` declara `"engines": { "node": ">=24.0.0" }`.

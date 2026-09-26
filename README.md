# olivarcalc-web

Monorepo JS del sitio público de OlivarCalc. Turborepo + Yarn 4 workspaces.

> **Las fórmulas viven aquí, no en la API.** `@olivar/calculations` es la única
> fuente de verdad de los cálculos. Laravel no recalcula (spec §4, §7.4).

La especificación completa está en `../ESPECIFICACION_OLIVARCALC.md`. Este
README cubre cómo trabajar con **este** repo.

## Requisitos

- **Node 24** (`.nvmrc`). Astro 7 y Vitest 5 exigen `>=22.12.0`.
  ```sh
  nvm install 24 && nvm use
  ```
  No se toca el `default` global de nvm a propósito: hay otros proyectos en la
  máquina que dependen de él (`DECISIONS.md` ADR-0006).
- **Yarn 4** vía corepack: `corepack enable`. El `packageManager` del
  `package.json` fija la versión.

## Estructura

```
apps/
  web/              Astro + islas React. De momento, una página marcador.
  mobile/           NO CREAR. Reservado para Expo (§3.1), fuera del MVP.
packages/
  calculations/     @olivar/calculations: las 5 fórmulas, puras
  api-client/       generado con orval desde openapi/openapi.json
  config/           tsconfig, eslint y prettier compartidos
openapi/
  openapi.json      copia versionada del contrato de la API
scripts/
  api-generate.mjs  descarga el contrato y regenera el cliente
```

## Comandos

| Comando | Qué hace |
|---|---|
| `yarn dev` | Astro en `http://localhost:4321` |
| `yarn build` | Build estático a `apps/web/dist` |
| `yarn test` | Vitest. `@olivar/calculations` exige ≥ 95 % de cobertura |
| `yarn lint` | ESLint sobre los tres paquetes con código |
| `yarn typecheck` | `tsc --noEmit` en todos |
| `yarn api:generate` | Descarga el contrato y regenera `packages/api-client` |
| `yarn e2e` | Playwright contra las cinco calculadoras y el resto del sitio |

Un solo test:

```sh
yarn workspace @olivar/calculations vitest run -t "decimal comma"
```

### Tests end-to-end

`yarn e2e` **necesita la API levantada**, porque Astro consulta el conjunto de
parámetros en el build y falla a propósito si no la encuentra (spec §10.1):

```sh
# en el repo hermano
cd ../olivarcalc-api && php artisan parameters:publish --force && php artisan serve

# aquí
yarn e2e
```

Si la API no responde, el arranque falla con el motivo y el comando exacto en
vez de una lista de timeouts. Playwright levanta el servidor de Astro solo; si
ya hay uno escuchando en el 4321 lo reutiliza, y entonces su barra de
herramientas de desarrollo sí queda activa.

## El paquete de cálculos

`@olivar/calculations` es donde vive el negocio. Reglas que **no** se rompen
(spec §4.1, §15):

- Funciones puras. Sin `fetch`, sin `Date.now()`, sin estado global.
- **Sin APIs de navegador**: tiene que importar en React Native / Hermes.
- Nada de `number` flotante para dinero o porcentajes: `big.js`, y el redondeo
  solo en la salida.
- Las fechas entran como argumento, nunca se leen del reloj.

Cada calculadora exporta su `schema` de zod, sus `requiredParams`,
`calculate()` y su `CALC_VERSION`.

### Fixtures golden

Los valores esperados de `packages/calculations/fixtures/*.json` están
**calculados a mano** a partir de la aritmética de la spec, no capturados de una
ejecución. Si una fórmula se rompe, el test falla en vez de reescribir su propia
referencia.

Al cambiar una fórmula, hay que actualizar a mano el fixture y subir
`CALC_VERSION`: un cambio de resultados es un cambio de versión, porque los
cálculos guardados en la web guardan esa versión.

### Idiomas

Código, nombres y comentarios en inglés. Todo texto visible en español de
España (`src/labels.ts` concentra las etiquetas, para que la futuro i18n sea un
cambio en un fichero).

## Contrato con la API

Flujo unidireccional (spec §3.3):

```sh
# 1. en la API
make -C ../olivarcalc-api openapi

# 2. aquí
OPENAPI_URL=http://127.0.0.1:8000/docs/api.json yarn api:generate
# o desde un fichero local:
OPENAPI_FILE=../olivarcalc-api/storage/app/openapi.json yarn api:generate
```

**Nunca edites `packages/api-client/src/generated/` a mano.** Cambia el
FormRequest, el API Resource o el PHPDoc en Laravel y regenera. El CI falla si
el cliente generado no coincide con el commiteado.

Lee `DECISIONS.md` ADR-0002 antes de fiarte de `apiFetcher`: los hooks
generados hoy llaman al `fetch` global.

## Rendimiento

Presupuestos de la spec §10.6, que vigila Lighthouse CI:

- ≤ 90 KB gzip de JS por página de herramienta, sin anuncios.
- LCP < 2,0 s y CLS < 0,05 en móvil simulado.

El build falla si la API no responde, a propósito: nunca publicar páginas
vacías (spec §10.1).

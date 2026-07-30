# Bundle Analysis Report

This report helps identify bundle size issues, dependency bloat, and optimization opportunities.

## Table of Contents

- [Quick Summary](#quick-summary)
- [Largest Modules by Output Contribution](#largest-modules-by-output-contribution)
- [Entry Point Analysis](#entry-point-analysis)
- [Dependency Chains](#dependency-chains)
- [Full Module Graph](#full-module-graph)
- [Raw Data for Searching](#raw-data-for-searching)

---

## Quick Summary

| Metric | Value |
|--------|-------|
| Total output size | 0.47 MB |
| Input modules | 82 |
| Entry points | 1 |
| node_modules contribution | 76 files (0.46 MB) |
| ESM modules | 82 |
| External imports | 1 |

## Largest Modules by Output Contribution

Modules sorted by bytes contributed to the output bundle. Large modules may indicate bloat.

| Output Bytes | % of Total | Module | Format |
|--------------|------------|--------|--------|
| 61.59 KB | 13.0% | `node_modules/zod/v4/core/schemas.js` | esm |
| 42.39 KB | 8.9% | `node_modules/zod/v4/classic/schemas.js` | esm |
| 19.92 KB | 4.2% | `node_modules/zod/v4/core/api.js` | esm |
| 19.51 KB | 4.1% | `node_modules/zod/v4/core/util.js` | esm |
| 16.96 KB | 3.6% | `node_modules/zod/v4/core/json-schema-processors.js` | esm |
| 16.22 KB | 3.4% | `node_modules/zod/v4/core/checks.js` | esm |
| 16.0 KB | 3.4% | `node_modules/zod/v4/classic/from-json-schema.js` | esm |
| 11.0 KB | 2.3% | `node_modules/zod/v4/core/to-json-schema.js` | esm |
| 9.68 KB | 2.0% | `node_modules/zod/v4/locales/he.js` | esm |
| 8.83 KB | 1.9% | `node_modules/zod/v4/core/index.js` | esm |
| 7.45 KB | 1.6% | `node_modules/zod/v4/core/regexes.js` | esm |
| 6.84 KB | 1.4% | `node_modules/zod/v4/locales/lt.js` | esm |
| 6.84 KB | 1.4% | `node_modules/zod/v4/classic/external.js` | esm |
| 5.82 KB | 1.2% | `node_modules/zod/v4/locales/ru.js` | esm |
| 5.73 KB | 1.2% | `node_modules/zod/v4/locales/ta.js` | esm |
| 5.73 KB | 1.2% | `node_modules/zod/v4/locales/be.js` | esm |
| 5.66 KB | 1.2% | `node_modules/zod/v4/locales/th.js` | esm |
| 5.63 KB | 1.2% | `node_modules/zod/v4/locales/ka.js` | esm |
| 5.61 KB | 1.2% | `node_modules/zod/v4/locales/km.js` | esm |
| 5.55 KB | 1.2% | `node_modules/zod/v4/locales/hy.js` | esm |

*...and 61 more modules with output contribution*

## Entry Point Analysis

Each entry point and the total code it loads (including shared chunks).

### Entry: `apps/sim/hooks/queries/execution-control.ts`

**Output file**: `./execution-control.js`
**Bundle size**: 0.47 MB
**Exports**: `useWorkflowExecutionStatus`, `useJobStatus`, `executionControlKeys`

**Bundled modules** (sorted by contribution):

| Bytes | Module |
|-------|--------|
| 61.59 KB | `node_modules/zod/v4/core/schemas.js` |
| 42.39 KB | `node_modules/zod/v4/classic/schemas.js` |
| 19.92 KB | `node_modules/zod/v4/core/api.js` |
| 19.51 KB | `node_modules/zod/v4/core/util.js` |
| 16.96 KB | `node_modules/zod/v4/core/json-schema-processors.js` |
| 16.22 KB | `node_modules/zod/v4/core/checks.js` |
| 16.0 KB | `node_modules/zod/v4/classic/from-json-schema.js` |
| 11.0 KB | `node_modules/zod/v4/core/to-json-schema.js` |
| 9.68 KB | `node_modules/zod/v4/locales/he.js` |
| 8.83 KB | `node_modules/zod/v4/core/index.js` |
| 7.45 KB | `node_modules/zod/v4/core/regexes.js` |
| 6.84 KB | `node_modules/zod/v4/locales/lt.js` |
| 6.84 KB | `node_modules/zod/v4/classic/external.js` |
| 5.82 KB | `node_modules/zod/v4/locales/ru.js` |
| 5.73 KB | `node_modules/zod/v4/locales/ta.js` |

*...and 67 more modules*

## Dependency Chains

For each module, shows what files import it. Use this to understand why a module is included.

### Most Commonly Imported Modules

Modules imported by many files. Extracting these to shared chunks may help.

| Import Count | Module | Imported By |
|--------------|--------|-------------|
| 48 | `node_modules/zod/v4/core/util.js` | `node_modules/zod/v4/classic/errors.js`, `node_modules/zod/v4/locales/en.js`, `node_modules/zod/v4/locales/az.js`+45 more |
| 10 | `node_modules/zod/v4/core/index.js` | `node_modules/zod/v4/classic/schemas.js`, `node_modules/zod/v4/classic/schemas.js`, `node_modules/zod/v4/classic/compat.js`+7 more |

## Full Module Graph

Complete dependency information for each module.

### `apps/sim/hooks/queries/execution-control.ts`

- **Output contribution**: 1.38 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `@tanstack/react-query` (import-statement, **external**)
  - `D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\client\request.ts` (import-statement, specifier: `@/lib/api/client/request`)
  - `D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\contracts\execution-control.ts` (import-statement, specifier: `@/lib/api/contracts/execution-control`)

### `apps/sim/lib/api/client/errors.ts`

- **Output contribution**: 297 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)

### `apps/sim/lib/api/client/request.ts`

- **Output contribution**: 5.20 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\client\errors.ts` (import-statement, specifier: `@/lib/api/client/errors`)

### `apps/sim/lib/api/contracts/execution-control.ts`

- **Output contribution**: 0.51 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\packages\api-contracts\src\execution-control.ts` (import-statement, specifier: `@sim/api-contracts/execution-control`)
  - `D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\contracts\types.ts` (import-statement, specifier: `@/lib/api/contracts/types`)

### `apps/sim/lib/api/contracts/types.ts`

- **Output contribution**: 62 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)

### `node_modules/zod/index.js`

- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\external.js` (import-statement, specifier: `./v4/classic/external.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\external.js` (import-statement, specifier: `./v4/classic/external.js`)

### `node_modules/zod/v4/classic/checks.js`

- **Output contribution**: 0.86 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)

### `node_modules/zod/v4/classic/coerce.js`

- **Output contribution**: 0.54 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)
  - `./schemas.js` (import-statement)

### `node_modules/zod/v4/classic/compat.js`

- **Output contribution**: 0.62 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)
  - `../core/index.js` (import-statement)

### `node_modules/zod/v4/classic/errors.js`

- **Output contribution**: 0.85 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)
  - `../core/index.js` (import-statement)
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/classic/external.js`

- **Output contribution**: 6.84 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\index.js` (import-statement, specifier: `../core/index.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\schemas.js` (import-statement, specifier: `./schemas.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\checks.js` (import-statement, specifier: `./checks.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\errors.js` (import-statement, specifier: `./errors.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\parse.js` (import-statement, specifier: `./parse.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\compat.js` (import-statement, specifier: `./compat.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\index.js` (import-statement, specifier: `../core/index.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\en.js` (import-statement, specifier: `../locales/en.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\index.js` (import-statement, specifier: `../core/index.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\json-schema-processors.js` (import-statement, specifier: `../core/json-schema-processors.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\from-json-schema.js` (import-statement, specifier: `./from-json-schema.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\index.js` (import-statement, specifier: `../locales/index.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\iso.js` (import-statement, specifier: `./iso.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\iso.js` (import-statement, specifier: `./iso.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\coerce.js` (import-statement, specifier: `./coerce.js`)

### `node_modules/zod/v4/classic/from-json-schema.js`

- **Output contribution**: 16.0 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/registries.js` (import-statement)
  - `./checks.js` (import-statement)
  - `./iso.js` (import-statement)
  - `./schemas.js` (import-statement)

### `node_modules/zod/v4/classic/iso.js`

- **Output contribution**: 1.19 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)
  - `./schemas.js` (import-statement)

### `node_modules/zod/v4/classic/parse.js`

- **Output contribution**: 0.74 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)
  - `./errors.js` (import-statement)

### `node_modules/zod/v4/classic/schemas.js`

- **Output contribution**: 42.39 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/index.js` (import-statement)
  - `../core/index.js` (import-statement)
  - `../core/json-schema-processors.js` (import-statement)
  - `../core/to-json-schema.js` (import-statement)
  - `./checks.js` (import-statement)
  - `./iso.js` (import-statement)
  - `./parse.js` (import-statement)

### `node_modules/zod/v4/core/api.js`

- **Output contribution**: 19.92 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./checks.js` (import-statement)
  - `./registries.js` (import-statement)
  - `./schemas.js` (import-statement)
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/checks.js`

- **Output contribution**: 16.22 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./core.js` (import-statement)
  - `./regexes.js` (import-statement)
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/core.js`

- **Output contribution**: 1.88 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)

### `node_modules/zod/v4/core/doc.js`

- **Output contribution**: 0.92 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)

### `node_modules/zod/v4/core/errors.js`

- **Output contribution**: 4.41 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./core.js` (import-statement)
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/index.js`

- **Output contribution**: 8.83 KB
- **Format**: esm
- **Imported by** (10 files): `node_modules/zod/v4/classic/schemas.js` `node_modules/zod/v4/classic/schemas.js` `node_modules/zod/v4/classic/compat.js` `node_modules/zod/v4/classic/compat.js` `node_modules/zod/v4/classic/checks.js` +5 more
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\core.js` (import-statement, specifier: `./core.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\parse.js` (import-statement, specifier: `./parse.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\errors.js` (import-statement, specifier: `./errors.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\schemas.js` (import-statement, specifier: `./schemas.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\checks.js` (import-statement, specifier: `./checks.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\versions.js` (import-statement, specifier: `./versions.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\util.js` (import-statement, specifier: `./util.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\regexes.js` (import-statement, specifier: `./regexes.js`)
  - `../locales/index.js` (import-statement)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\registries.js` (import-statement, specifier: `./registries.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\doc.js` (import-statement, specifier: `./doc.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\api.js` (import-statement, specifier: `./api.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\to-json-schema.js` (import-statement, specifier: `./to-json-schema.js`)
  - `./json-schema-processors.js` (import-statement)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\json-schema-generator.js` (import-statement, specifier: `./json-schema-generator.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\json-schema.js` (import-statement, specifier: `./json-schema.js`)

### `node_modules/zod/v4/core/json-schema-generator.js`

- **Output contribution**: 1.59 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./json-schema-processors.js` (import-statement)
  - `./to-json-schema.js` (import-statement)

### `node_modules/zod/v4/core/json-schema-processors.js`

- **Output contribution**: 16.96 KB
- **Format**: esm
- **Imported by** (1 files): `node_modules/zod/v4/classic/schemas.js`
- **Imports**:
  - `./to-json-schema.js` (import-statement)
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/json-schema.js`

- **Output contribution**: 30 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)

### `node_modules/zod/v4/core/parse.js`

- **Output contribution**: 3.87 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./core.js` (import-statement)
  - `./errors.js` (import-statement)
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/regexes.js`

- **Output contribution**: 7.45 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/registries.js`

- **Output contribution**: 1.21 KB
- **Format**: esm
- **Imported by** (1 files): `node_modules/zod/v4/classic/from-json-schema.js`

### `node_modules/zod/v4/core/schemas.js`

- **Output contribution**: 61.59 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./checks.js` (import-statement)
  - `./core.js` (import-statement)
  - `./doc.js` (import-statement)
  - `./parse.js` (import-statement)
  - `./regexes.js` (import-statement)
  - `./util.js` (import-statement)
  - `./versions.js` (import-statement)
  - `./util.js` (import-statement)

### `node_modules/zod/v4/core/to-json-schema.js`

- **Output contribution**: 11.0 KB
- **Format**: esm
- **Imported by** (1 files): `node_modules/zod/v4/classic/schemas.js`
- **Imports**:
  - `./registries.js` (import-statement)

### `node_modules/zod/v4/core/util.js`

- **Output contribution**: 19.51 KB
- **Format**: esm
- **Imported by** (48 files): `node_modules/zod/v4/classic/errors.js` `node_modules/zod/v4/locales/en.js` `node_modules/zod/v4/locales/az.js` `node_modules/zod/v4/locales/km.js` `node_modules/zod/v4/locales/lt.js` +43 more

### `node_modules/zod/v4/core/versions.js`

- **Output contribution**: 54 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)

### `node_modules/zod/v4/locales/ar.js`

- **Output contribution**: 4.57 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/az.js`

- **Output contribution**: 3.90 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/be.js`

- **Output contribution**: 5.73 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/bg.js`

- **Output contribution**: 5.1 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ca.js`

- **Output contribution**: 4.0 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/cs.js`

- **Output contribution**: 4.13 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/da.js`

- **Output contribution**: 4.15 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/de.js`

- **Output contribution**: 3.97 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/en.js`

- **Output contribution**: 3.70 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/eo.js`

- **Output contribution**: 3.98 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/es.js`

- **Output contribution**: 4.72 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/fa.js`

- **Output contribution**: 4.46 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/fi.js`

- **Output contribution**: 4.17 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/fr-CA.js`

- **Output contribution**: 3.94 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/fr.js`

- **Output contribution**: 3.97 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/he.js`

- **Output contribution**: 9.68 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/hu.js`

- **Output contribution**: 4.1 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/hy.js`

- **Output contribution**: 5.55 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/id.js`

- **Output contribution**: 3.96 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/index.js`

- **Output contribution**: 1.25 KB
- **Format**: esm
- **Imported by** (1 files): `node_modules/zod/v4/core/index.js`
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ar.js` (import-statement, specifier: `./ar.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\az.js` (import-statement, specifier: `./az.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\be.js` (import-statement, specifier: `./be.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\bg.js` (import-statement, specifier: `./bg.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ca.js` (import-statement, specifier: `./ca.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\cs.js` (import-statement, specifier: `./cs.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\da.js` (import-statement, specifier: `./da.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\de.js` (import-statement, specifier: `./de.js`)
  - `./en.js` (import-statement)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\eo.js` (import-statement, specifier: `./eo.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\es.js` (import-statement, specifier: `./es.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fa.js` (import-statement, specifier: `./fa.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fi.js` (import-statement, specifier: `./fi.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fr.js` (import-statement, specifier: `./fr.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fr-CA.js` (import-statement, specifier: `./fr-CA.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\he.js` (import-statement, specifier: `./he.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\hu.js` (import-statement, specifier: `./hu.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\hy.js` (import-statement, specifier: `./hy.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\id.js` (import-statement, specifier: `./id.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\is.js` (import-statement, specifier: `./is.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\it.js` (import-statement, specifier: `./it.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ja.js` (import-statement, specifier: `./ja.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ka.js` (import-statement, specifier: `./ka.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\kh.js` (import-statement, specifier: `./kh.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\km.js` (import-statement, specifier: `./km.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ko.js` (import-statement, specifier: `./ko.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\lt.js` (import-statement, specifier: `./lt.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\mk.js` (import-statement, specifier: `./mk.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ms.js` (import-statement, specifier: `./ms.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\nl.js` (import-statement, specifier: `./nl.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\no.js` (import-statement, specifier: `./no.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ota.js` (import-statement, specifier: `./ota.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ps.js` (import-statement, specifier: `./ps.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\pl.js` (import-statement, specifier: `./pl.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\pt.js` (import-statement, specifier: `./pt.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ru.js` (import-statement, specifier: `./ru.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\sl.js` (import-statement, specifier: `./sl.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\sv.js` (import-statement, specifier: `./sv.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ta.js` (import-statement, specifier: `./ta.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\th.js` (import-statement, specifier: `./th.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\tr.js` (import-statement, specifier: `./tr.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ua.js` (import-statement, specifier: `./ua.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\uk.js` (import-statement, specifier: `./uk.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ur.js` (import-statement, specifier: `./ur.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\uz.js` (import-statement, specifier: `./uz.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\vi.js` (import-statement, specifier: `./vi.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\zh-CN.js` (import-statement, specifier: `./zh-CN.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\zh-TW.js` (import-statement, specifier: `./zh-TW.js`)
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\yo.js` (import-statement, specifier: `./yo.js`)

### `node_modules/zod/v4/locales/is.js`

- **Output contribution**: 4.0 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/it.js`

- **Output contribution**: 3.95 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ja.js`

- **Output contribution**: 4.24 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ka.js`

- **Output contribution**: 5.63 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/kh.js`

- **Output contribution**: 49 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./km.js` (import-statement)

### `node_modules/zod/v4/locales/km.js`

- **Output contribution**: 5.61 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ko.js`

- **Output contribution**: 4.28 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/lt.js`

- **Output contribution**: 6.84 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/mk.js`

- **Output contribution**: 4.53 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ms.js`

- **Output contribution**: 3.87 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/nl.js`

- **Output contribution**: 4.13 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/no.js`

- **Output contribution**: 3.89 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ota.js`

- **Output contribution**: 3.90 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/pl.js`

- **Output contribution**: 4.34 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ps.js`

- **Output contribution**: 4.24 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/pt.js`

- **Output contribution**: 3.95 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ru.js`

- **Output contribution**: 5.82 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/sl.js`

- **Output contribution**: 3.94 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/sv.js`

- **Output contribution**: 4.0 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ta.js`

- **Output contribution**: 5.73 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/th.js`

- **Output contribution**: 5.66 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/tr.js`

- **Output contribution**: 3.85 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ua.js`

- **Output contribution**: 49 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `./uk.js` (import-statement)

### `node_modules/zod/v4/locales/uk.js`

- **Output contribution**: 4.81 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/ur.js`

- **Output contribution**: 4.64 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/uz.js`

- **Output contribution**: 4.1 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/vi.js`

- **Output contribution**: 4.15 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/yo.js`

- **Output contribution**: 4.0 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/zh-CN.js`

- **Output contribution**: 3.83 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `node_modules/zod/v4/locales/zh-TW.js`

- **Output contribution**: 3.88 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `../core/util.js` (import-statement)

### `packages/api-contracts/src/execution-control.ts`

- **Output contribution**: 3.30 KB
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `D:\workspace\workflow\sim2-refactor\node_modules\zod\index.js` (import-statement, specifier: `zod`)

## Raw Data for Searching

This section contains raw, grep-friendly data. Use these patterns:
- `[MODULE:` - Find all modules
- `[OUTPUT_BYTES:` - Find output contribution for each module
- `[IMPORT:` - Find all import relationships
- `[IMPORTED_BY:` - Find reverse dependencies
- `[ENTRY:` - Find entry points
- `[EXTERNAL:` - Find external imports
- `[NODE_MODULES:` - Find node_modules files

### All Modules

```
[MODULE: node_modules/zod/v4/core/schemas.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/schemas.js = 61590 bytes]
[FORMAT: node_modules/zod/v4/core/schemas.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/schemas.js]
[MODULE: node_modules/zod/v4/classic/schemas.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/schemas.js = 42393 bytes]
[FORMAT: node_modules/zod/v4/classic/schemas.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/schemas.js]
[MODULE: node_modules/zod/v4/core/api.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/api.js = 19923 bytes]
[FORMAT: node_modules/zod/v4/core/api.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/api.js]
[MODULE: node_modules/zod/v4/core/util.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/util.js = 19505 bytes]
[FORMAT: node_modules/zod/v4/core/util.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/util.js]
[MODULE: node_modules/zod/v4/core/json-schema-processors.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/json-schema-processors.js = 16962 bytes]
[FORMAT: node_modules/zod/v4/core/json-schema-processors.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/json-schema-processors.js]
[MODULE: node_modules/zod/v4/core/checks.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/checks.js = 16218 bytes]
[FORMAT: node_modules/zod/v4/core/checks.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/checks.js]
[MODULE: node_modules/zod/v4/classic/from-json-schema.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/from-json-schema.js = 16013 bytes]
[FORMAT: node_modules/zod/v4/classic/from-json-schema.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/from-json-schema.js]
[MODULE: node_modules/zod/v4/core/to-json-schema.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/to-json-schema.js = 11033 bytes]
[FORMAT: node_modules/zod/v4/core/to-json-schema.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/to-json-schema.js]
[MODULE: node_modules/zod/v4/locales/he.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/he.js = 9684 bytes]
[FORMAT: node_modules/zod/v4/locales/he.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/he.js]
[MODULE: node_modules/zod/v4/core/index.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/index.js = 8825 bytes]
[FORMAT: node_modules/zod/v4/core/index.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/index.js]
[MODULE: node_modules/zod/v4/core/regexes.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/regexes.js = 7448 bytes]
[FORMAT: node_modules/zod/v4/core/regexes.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/regexes.js]
[MODULE: node_modules/zod/v4/locales/lt.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/lt.js = 6838 bytes]
[FORMAT: node_modules/zod/v4/locales/lt.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/lt.js]
[MODULE: node_modules/zod/v4/classic/external.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/external.js = 6836 bytes]
[FORMAT: node_modules/zod/v4/classic/external.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/external.js]
[MODULE: node_modules/zod/v4/locales/ru.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ru.js = 5824 bytes]
[FORMAT: node_modules/zod/v4/locales/ru.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ru.js]
[MODULE: node_modules/zod/v4/locales/ta.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ta.js = 5733 bytes]
[FORMAT: node_modules/zod/v4/locales/ta.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ta.js]
[MODULE: node_modules/zod/v4/locales/be.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/be.js = 5726 bytes]
[FORMAT: node_modules/zod/v4/locales/be.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/be.js]
[MODULE: node_modules/zod/v4/locales/th.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/th.js = 5656 bytes]
[FORMAT: node_modules/zod/v4/locales/th.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/th.js]
[MODULE: node_modules/zod/v4/locales/ka.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ka.js = 5633 bytes]
[FORMAT: node_modules/zod/v4/locales/ka.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ka.js]
[MODULE: node_modules/zod/v4/locales/km.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/km.js = 5608 bytes]
[FORMAT: node_modules/zod/v4/locales/km.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/km.js]
[MODULE: node_modules/zod/v4/locales/hy.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/hy.js = 5549 bytes]
[FORMAT: node_modules/zod/v4/locales/hy.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/hy.js]
[MODULE: apps/sim/lib/api/client/request.ts]
[OUTPUT_BYTES: apps/sim/lib/api/client/request.ts = 5201 bytes]
[FORMAT: apps/sim/lib/api/client/request.ts = esm]
[MODULE: node_modules/zod/v4/locales/bg.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/bg.js = 5057 bytes]
[FORMAT: node_modules/zod/v4/locales/bg.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/bg.js]
[MODULE: node_modules/zod/v4/locales/uk.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/uk.js = 4809 bytes]
[FORMAT: node_modules/zod/v4/locales/uk.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/uk.js]
[MODULE: node_modules/zod/v4/locales/es.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/es.js = 4717 bytes]
[FORMAT: node_modules/zod/v4/locales/es.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/es.js]
[MODULE: node_modules/zod/v4/locales/ur.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ur.js = 4638 bytes]
[FORMAT: node_modules/zod/v4/locales/ur.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ur.js]
[MODULE: node_modules/zod/v4/locales/ar.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ar.js = 4573 bytes]
[FORMAT: node_modules/zod/v4/locales/ar.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ar.js]
[MODULE: node_modules/zod/v4/locales/mk.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/mk.js = 4528 bytes]
[FORMAT: node_modules/zod/v4/locales/mk.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/mk.js]
[MODULE: node_modules/zod/v4/locales/fa.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/fa.js = 4462 bytes]
[FORMAT: node_modules/zod/v4/locales/fa.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/fa.js]
[MODULE: node_modules/zod/v4/core/errors.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/errors.js = 4413 bytes]
[FORMAT: node_modules/zod/v4/core/errors.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/errors.js]
[MODULE: node_modules/zod/v4/locales/pl.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/pl.js = 4337 bytes]
[FORMAT: node_modules/zod/v4/locales/pl.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/pl.js]
[MODULE: node_modules/zod/v4/locales/ko.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ko.js = 4275 bytes]
[FORMAT: node_modules/zod/v4/locales/ko.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ko.js]
[MODULE: node_modules/zod/v4/locales/ps.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ps.js = 4240 bytes]
[FORMAT: node_modules/zod/v4/locales/ps.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ps.js]
[MODULE: node_modules/zod/v4/locales/ja.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ja.js = 4238 bytes]
[FORMAT: node_modules/zod/v4/locales/ja.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ja.js]
[MODULE: node_modules/zod/v4/locales/fi.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/fi.js = 4167 bytes]
[FORMAT: node_modules/zod/v4/locales/fi.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/fi.js]
[MODULE: node_modules/zod/v4/locales/vi.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/vi.js = 4150 bytes]
[FORMAT: node_modules/zod/v4/locales/vi.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/vi.js]
[MODULE: node_modules/zod/v4/locales/da.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/da.js = 4145 bytes]
[FORMAT: node_modules/zod/v4/locales/da.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/da.js]
[MODULE: node_modules/zod/v4/locales/cs.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/cs.js = 4132 bytes]
[FORMAT: node_modules/zod/v4/locales/cs.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/cs.js]
[MODULE: node_modules/zod/v4/locales/nl.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/nl.js = 4125 bytes]
[FORMAT: node_modules/zod/v4/locales/nl.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/nl.js]
[MODULE: node_modules/zod/v4/locales/hu.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/hu.js = 4075 bytes]
[FORMAT: node_modules/zod/v4/locales/hu.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/hu.js]
[MODULE: node_modules/zod/v4/locales/uz.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/uz.js = 4056 bytes]
[FORMAT: node_modules/zod/v4/locales/uz.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/uz.js]
[MODULE: node_modules/zod/v4/locales/yo.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/yo.js = 4049 bytes]
[FORMAT: node_modules/zod/v4/locales/yo.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/yo.js]
[MODULE: node_modules/zod/v4/locales/sv.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/sv.js = 4026 bytes]
[FORMAT: node_modules/zod/v4/locales/sv.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/sv.js]
[MODULE: node_modules/zod/v4/locales/ca.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ca.js = 4006 bytes]
[FORMAT: node_modules/zod/v4/locales/ca.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ca.js]
[MODULE: node_modules/zod/v4/locales/is.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/is.js = 4006 bytes]
[FORMAT: node_modules/zod/v4/locales/is.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/is.js]
[MODULE: node_modules/zod/v4/locales/eo.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/eo.js = 3979 bytes]
[FORMAT: node_modules/zod/v4/locales/eo.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/eo.js]
[MODULE: node_modules/zod/v4/locales/de.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/de.js = 3965 bytes]
[FORMAT: node_modules/zod/v4/locales/de.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/de.js]
[MODULE: node_modules/zod/v4/locales/fr.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/fr.js = 3965 bytes]
[FORMAT: node_modules/zod/v4/locales/fr.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/fr.js]
[MODULE: node_modules/zod/v4/locales/id.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/id.js = 3964 bytes]
[FORMAT: node_modules/zod/v4/locales/id.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/id.js]
[MODULE: node_modules/zod/v4/locales/it.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/it.js = 3952 bytes]
[FORMAT: node_modules/zod/v4/locales/it.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/it.js]
[MODULE: node_modules/zod/v4/locales/pt.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/pt.js = 3948 bytes]
[FORMAT: node_modules/zod/v4/locales/pt.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/pt.js]
[MODULE: node_modules/zod/v4/locales/sl.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/sl.js = 3938 bytes]
[FORMAT: node_modules/zod/v4/locales/sl.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/sl.js]
[MODULE: node_modules/zod/v4/locales/fr-CA.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/fr-CA.js = 3937 bytes]
[FORMAT: node_modules/zod/v4/locales/fr-CA.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/fr-CA.js]
[MODULE: node_modules/zod/v4/locales/az.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/az.js = 3904 bytes]
[FORMAT: node_modules/zod/v4/locales/az.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/az.js]
[MODULE: node_modules/zod/v4/locales/ota.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ota.js = 3901 bytes]
[FORMAT: node_modules/zod/v4/locales/ota.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ota.js]
[MODULE: node_modules/zod/v4/locales/no.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/no.js = 3885 bytes]
[FORMAT: node_modules/zod/v4/locales/no.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/no.js]
[MODULE: node_modules/zod/v4/locales/zh-TW.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/zh-TW.js = 3880 bytes]
[FORMAT: node_modules/zod/v4/locales/zh-TW.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/zh-TW.js]
[MODULE: node_modules/zod/v4/core/parse.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/parse.js = 3874 bytes]
[FORMAT: node_modules/zod/v4/core/parse.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/parse.js]
[MODULE: node_modules/zod/v4/locales/ms.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ms.js = 3873 bytes]
[FORMAT: node_modules/zod/v4/locales/ms.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ms.js]
[MODULE: node_modules/zod/v4/locales/tr.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/tr.js = 3849 bytes]
[FORMAT: node_modules/zod/v4/locales/tr.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/tr.js]
[MODULE: node_modules/zod/v4/locales/zh-CN.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/zh-CN.js = 3829 bytes]
[FORMAT: node_modules/zod/v4/locales/zh-CN.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/zh-CN.js]
[MODULE: node_modules/zod/v4/locales/en.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/en.js = 3703 bytes]
[FORMAT: node_modules/zod/v4/locales/en.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/en.js]
[MODULE: packages/api-contracts/src/execution-control.ts]
[OUTPUT_BYTES: packages/api-contracts/src/execution-control.ts = 3303 bytes]
[FORMAT: packages/api-contracts/src/execution-control.ts = esm]
[MODULE: node_modules/zod/v4/core/core.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/core.js = 1882 bytes]
[FORMAT: node_modules/zod/v4/core/core.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/core.js]
[MODULE: node_modules/zod/v4/core/json-schema-generator.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/json-schema-generator.js = 1593 bytes]
[FORMAT: node_modules/zod/v4/core/json-schema-generator.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/json-schema-generator.js]
[MODULE: apps/sim/hooks/queries/execution-control.ts]
[OUTPUT_BYTES: apps/sim/hooks/queries/execution-control.ts = 1379 bytes]
[FORMAT: apps/sim/hooks/queries/execution-control.ts = esm]
[MODULE: node_modules/zod/v4/locales/index.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/index.js = 1250 bytes]
[FORMAT: node_modules/zod/v4/locales/index.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/index.js]
[MODULE: node_modules/zod/v4/core/registries.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/registries.js = 1207 bytes]
[FORMAT: node_modules/zod/v4/core/registries.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/registries.js]
[MODULE: node_modules/zod/v4/classic/iso.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/iso.js = 1193 bytes]
[FORMAT: node_modules/zod/v4/classic/iso.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/iso.js]
[MODULE: node_modules/zod/v4/core/doc.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/doc.js = 915 bytes]
[FORMAT: node_modules/zod/v4/core/doc.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/doc.js]
[MODULE: node_modules/zod/v4/classic/checks.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/checks.js = 858 bytes]
[FORMAT: node_modules/zod/v4/classic/checks.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/checks.js]
[MODULE: node_modules/zod/v4/classic/errors.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/errors.js = 851 bytes]
[FORMAT: node_modules/zod/v4/classic/errors.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/errors.js]
[MODULE: node_modules/zod/v4/classic/parse.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/parse.js = 736 bytes]
[FORMAT: node_modules/zod/v4/classic/parse.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/parse.js]
[MODULE: node_modules/zod/v4/classic/compat.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/compat.js = 624 bytes]
[FORMAT: node_modules/zod/v4/classic/compat.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/compat.js]
[MODULE: node_modules/zod/v4/classic/coerce.js]
[OUTPUT_BYTES: node_modules/zod/v4/classic/coerce.js = 540 bytes]
[FORMAT: node_modules/zod/v4/classic/coerce.js = esm]
[NODE_MODULES: node_modules/zod/v4/classic/coerce.js]
[MODULE: apps/sim/lib/api/contracts/execution-control.ts]
[OUTPUT_BYTES: apps/sim/lib/api/contracts/execution-control.ts = 512 bytes]
[FORMAT: apps/sim/lib/api/contracts/execution-control.ts = esm]
[MODULE: apps/sim/lib/api/client/errors.ts]
[OUTPUT_BYTES: apps/sim/lib/api/client/errors.ts = 297 bytes]
[FORMAT: apps/sim/lib/api/client/errors.ts = esm]
[MODULE: apps/sim/lib/api/contracts/types.ts]
[OUTPUT_BYTES: apps/sim/lib/api/contracts/types.ts = 62 bytes]
[FORMAT: apps/sim/lib/api/contracts/types.ts = esm]
[MODULE: node_modules/zod/v4/core/versions.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/versions.js = 54 bytes]
[FORMAT: node_modules/zod/v4/core/versions.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/versions.js]
[MODULE: node_modules/zod/v4/locales/ua.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/ua.js = 49 bytes]
[FORMAT: node_modules/zod/v4/locales/ua.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/ua.js]
[MODULE: node_modules/zod/v4/locales/kh.js]
[OUTPUT_BYTES: node_modules/zod/v4/locales/kh.js = 49 bytes]
[FORMAT: node_modules/zod/v4/locales/kh.js = esm]
[NODE_MODULES: node_modules/zod/v4/locales/kh.js]
[MODULE: node_modules/zod/v4/core/json-schema.js]
[OUTPUT_BYTES: node_modules/zod/v4/core/json-schema.js = 30 bytes]
[FORMAT: node_modules/zod/v4/core/json-schema.js = esm]
[NODE_MODULES: node_modules/zod/v4/core/json-schema.js]
[MODULE: node_modules/zod/index.js]
[FORMAT: node_modules/zod/index.js = esm]
[NODE_MODULES: node_modules/zod/index.js]
```

### All Imports

```
[EXTERNAL: apps/sim/hooks/queries/execution-control.ts imports @tanstack/react-query]
[IMPORT: apps/sim/hooks/queries/execution-control.ts -> D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\client\request.ts]
[IMPORT: apps/sim/hooks/queries/execution-control.ts -> D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\contracts\execution-control.ts]
[IMPORT: apps/sim/lib/api/client/request.ts -> D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\client\errors.ts]
[IMPORT: apps/sim/lib/api/contracts/execution-control.ts -> D:\workspace\workflow\sim2-refactor\packages\api-contracts\src\execution-control.ts]
[IMPORT: apps/sim/lib/api/contracts/execution-control.ts -> D:\workspace\workflow\sim2-refactor\apps\sim\lib\api\contracts\types.ts]
[IMPORT: packages/api-contracts/src/execution-control.ts -> D:\workspace\workflow\sim2-refactor\node_modules\zod\index.js]
[IMPORT: node_modules/zod/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\external.js]
[IMPORT: node_modules/zod/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\external.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\index.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\schemas.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\checks.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\errors.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\parse.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\compat.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\index.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\en.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\index.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\json-schema-processors.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\from-json-schema.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\index.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\iso.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\iso.js]
[IMPORT: node_modules/zod/v4/classic/external.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\classic\coerce.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ar.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\az.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\be.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\bg.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ca.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\cs.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\da.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\de.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> ./en.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\eo.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\es.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fa.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fi.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fr.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\fr-CA.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\he.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\hu.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\hy.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\id.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\is.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\it.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ja.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ka.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\kh.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\km.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ko.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\lt.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\mk.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ms.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\nl.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\no.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ota.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ps.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\pl.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\pt.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ru.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\sl.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\sv.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ta.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\th.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\tr.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ua.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\uk.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\ur.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\uz.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\vi.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\zh-CN.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\zh-TW.js]
[IMPORT: node_modules/zod/v4/locales/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\locales\yo.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\core.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\parse.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\errors.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\schemas.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\checks.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\versions.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\util.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\regexes.js]
[IMPORT: node_modules/zod/v4/core/index.js -> ../locales/index.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\registries.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\doc.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\api.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\to-json-schema.js]
[IMPORT: node_modules/zod/v4/core/index.js -> ./json-schema-processors.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\json-schema-generator.js]
[IMPORT: node_modules/zod/v4/core/index.js -> D:\workspace\workflow\sim2-refactor\node_modules\zod\v4\core\json-schema.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ../core/json-schema-processors.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ../core/to-json-schema.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ./checks.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ./iso.js]
[IMPORT: node_modules/zod/v4/classic/schemas.js -> ./parse.js]
[IMPORT: node_modules/zod/v4/core/json-schema-processors.js -> ./to-json-schema.js]
[IMPORT: node_modules/zod/v4/core/json-schema-processors.js -> ./util.js]
[IMPORT: node_modules/zod/v4/classic/from-json-schema.js -> ../core/registries.js]
[IMPORT: node_modules/zod/v4/classic/from-json-schema.js -> ./checks.js]
[IMPORT: node_modules/zod/v4/classic/from-json-schema.js -> ./iso.js]
[IMPORT: node_modules/zod/v4/classic/from-json-schema.js -> ./schemas.js]
[IMPORT: node_modules/zod/v4/classic/compat.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/compat.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/checks.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/errors.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/errors.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/errors.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/en.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/classic/iso.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/iso.js -> ./schemas.js]
[IMPORT: node_modules/zod/v4/classic/parse.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/parse.js -> ./errors.js]
[IMPORT: node_modules/zod/v4/classic/coerce.js -> ../core/index.js]
[IMPORT: node_modules/zod/v4/classic/coerce.js -> ./schemas.js]
[IMPORT: node_modules/zod/v4/locales/az.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/km.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/lt.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/bg.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/fr-CA.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/id.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/uz.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/tr.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ru.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/mk.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/th.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/zh-CN.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/da.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/cs.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ota.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/pt.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/sl.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/zh-TW.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ar.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/sv.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ta.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/no.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/de.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ua.js -> ./uk.js]
[IMPORT: node_modules/zod/v4/locales/nl.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/fr.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/vi.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/es.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/fa.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/hu.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/he.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ja.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ka.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ps.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ca.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/hy.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/fi.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/be.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/is.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/it.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ko.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/pl.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/uk.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ms.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/ur.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/yo.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/eo.js -> ../core/util.js]
[IMPORT: node_modules/zod/v4/locales/kh.js -> ./km.js]
[IMPORT: node_modules/zod/v4/core/parse.js -> ./core.js]
[IMPORT: node_modules/zod/v4/core/parse.js -> ./errors.js]
[IMPORT: node_modules/zod/v4/core/parse.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/errors.js -> ./core.js]
[IMPORT: node_modules/zod/v4/core/errors.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/json-schema-generator.js -> ./json-schema-processors.js]
[IMPORT: node_modules/zod/v4/core/json-schema-generator.js -> ./to-json-schema.js]
[IMPORT: node_modules/zod/v4/core/api.js -> ./checks.js]
[IMPORT: node_modules/zod/v4/core/api.js -> ./registries.js]
[IMPORT: node_modules/zod/v4/core/api.js -> ./schemas.js]
[IMPORT: node_modules/zod/v4/core/api.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/checks.js -> ./core.js]
[IMPORT: node_modules/zod/v4/core/checks.js -> ./regexes.js]
[IMPORT: node_modules/zod/v4/core/checks.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/regexes.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./checks.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./core.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./doc.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./parse.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./regexes.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./versions.js]
[IMPORT: node_modules/zod/v4/core/schemas.js -> ./util.js]
[IMPORT: node_modules/zod/v4/core/to-json-schema.js -> ./registries.js]
```

### Reverse Dependencies (Imported By)

```
[IMPORTED_BY: node_modules/zod/v4/locales/index.js <- node_modules/zod/v4/core/index.js]
[IMPORTED_BY: node_modules/zod/v4/core/to-json-schema.js <- node_modules/zod/v4/classic/schemas.js]
[IMPORTED_BY: node_modules/zod/v4/core/registries.js <- node_modules/zod/v4/classic/from-json-schema.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/classic/errors.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/en.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/az.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/km.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/lt.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/bg.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/fr-CA.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/id.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/uz.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/tr.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ru.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/mk.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/th.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/zh-CN.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/da.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/cs.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ota.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/pt.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/sl.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/zh-TW.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ar.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/sv.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ta.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/no.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/de.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/nl.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/fr.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/vi.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/es.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/fa.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/hu.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/he.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ja.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ka.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ps.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ca.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/hy.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/fi.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/be.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/is.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/it.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ko.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/pl.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/uk.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ms.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/ur.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/yo.js]
[IMPORTED_BY: node_modules/zod/v4/core/util.js <- node_modules/zod/v4/locales/eo.js]
[IMPORTED_BY: node_modules/zod/v4/core/json-schema-processors.js <- node_modules/zod/v4/classic/schemas.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/schemas.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/schemas.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/compat.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/compat.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/checks.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/errors.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/errors.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/iso.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/parse.js]
[IMPORTED_BY: node_modules/zod/v4/core/index.js <- node_modules/zod/v4/classic/coerce.js]
```

### Entry Points

```
[ENTRY: apps/sim/hooks/queries/execution-control.ts -> ./execution-control.js (474918 bytes)]
```

### node_modules Summary

```
[NODE_MODULES: node_modules/zod/v4/core/schemas.js (contributes 61590 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/schemas.js (contributes 42393 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/api.js (contributes 19923 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/util.js (contributes 19505 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/json-schema-processors.js (contributes 16962 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/checks.js (contributes 16218 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/from-json-schema.js (contributes 16013 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/to-json-schema.js (contributes 11033 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/he.js (contributes 9684 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/index.js (contributes 8825 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/regexes.js (contributes 7448 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/lt.js (contributes 6838 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/external.js (contributes 6836 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ru.js (contributes 5824 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ta.js (contributes 5733 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/be.js (contributes 5726 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/th.js (contributes 5656 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ka.js (contributes 5633 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/km.js (contributes 5608 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/hy.js (contributes 5549 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/bg.js (contributes 5057 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/uk.js (contributes 4809 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/es.js (contributes 4717 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ur.js (contributes 4638 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ar.js (contributes 4573 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/mk.js (contributes 4528 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/fa.js (contributes 4462 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/errors.js (contributes 4413 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/pl.js (contributes 4337 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ko.js (contributes 4275 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ps.js (contributes 4240 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ja.js (contributes 4238 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/fi.js (contributes 4167 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/vi.js (contributes 4150 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/da.js (contributes 4145 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/cs.js (contributes 4132 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/nl.js (contributes 4125 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/hu.js (contributes 4075 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/uz.js (contributes 4056 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/yo.js (contributes 4049 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/sv.js (contributes 4026 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ca.js (contributes 4006 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/is.js (contributes 4006 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/eo.js (contributes 3979 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/de.js (contributes 3965 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/fr.js (contributes 3965 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/id.js (contributes 3964 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/it.js (contributes 3952 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/pt.js (contributes 3948 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/sl.js (contributes 3938 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/fr-CA.js (contributes 3937 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/az.js (contributes 3904 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ota.js (contributes 3901 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/no.js (contributes 3885 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/zh-TW.js (contributes 3880 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/parse.js (contributes 3874 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ms.js (contributes 3873 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/tr.js (contributes 3849 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/zh-CN.js (contributes 3829 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/en.js (contributes 3703 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/core.js (contributes 1882 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/json-schema-generator.js (contributes 1593 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/index.js (contributes 1250 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/registries.js (contributes 1207 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/iso.js (contributes 1193 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/doc.js (contributes 915 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/checks.js (contributes 858 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/errors.js (contributes 851 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/parse.js (contributes 736 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/compat.js (contributes 624 bytes)]
[NODE_MODULES: node_modules/zod/v4/classic/coerce.js (contributes 540 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/versions.js (contributes 54 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/ua.js (contributes 49 bytes)]
[NODE_MODULES: node_modules/zod/v4/locales/kh.js (contributes 49 bytes)]
[NODE_MODULES: node_modules/zod/v4/core/json-schema.js (contributes 30 bytes)]
```

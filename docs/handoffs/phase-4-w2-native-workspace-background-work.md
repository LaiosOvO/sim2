# W2 API-1009 native workspace background work

## Outcome

`GET /api/workspaces/[id]/background-work` now has a native Workspace Forking deep module,
a production PostgreSQL adapter, and a focused browser contract. Independent re-review approved
the functional route on 2026-07-30, so API-1009 is now part of the strict accepted-progress count.
The whole-page Next cold-start milestone remains open.

The browser hook no longer imports the 816-line, 35,173-byte
`apps/sim/lib/api/contracts/workspace-fork.ts` monolith. It consumes
`apps/sim/lib/api/contracts/workspace-background-work.ts`, which wraps the versioned
`@sim/api-contracts/workspace-background-work` subpath with Sim's local `defineRouteContract`.
The shared request client also imports its types directly from `contracts/types`, so a type-only
dependency no longer opens the full contract barrel.

## Deep-module boundary

- Application interface: `ListWorkspaceBackgroundWorkUseCase.execute`
- Persistence seam: `WorkspaceBackgroundWorkReader.listInvolving`
- PostgreSQL implementation: `createDrizzleWorkspaceBackgroundWorkReader`
- HTTP adapter: `createListWorkspaceBackgroundWorkHandler`
- Versioned wire contract: `listWorkspaceBackgroundWorkContractV1`
- Focused Web wrapper: `getWorkspaceBackgroundWorkContract`

The reader hides the two-query implementation: first it finds live child workspaces, then it
performs one keyset-paginated background-work query. Application and transport code do not know
the schema, joins, OR expression, cursor encoding, over-fetch, or sort implementation.

## Donor compatibility

Sim2 and Polaris have identical route, store, hook, and legacy contract files at the audited
baselines. Their SHA-256 values are:

| Surface | SHA-256 |
| --- | --- |
| route | `3E19A1FD299FCD75FC41E90D2A935E502366D6628ED17B1DDFA0FCD2B3768896` |
| store | `BFF018CFC420A805C723CFE100BF67E8AF33933B58FCB17B5398313C5AC5F988` |
| hook | `2E84E1A6AD7A98073B8491964A73125A2277B38DA981239054BDD2709392F3C8` |
| contract | `84BF295C30ABD671386FEF4CA7A89B0808B9B95815865DC2339E03D17C997E71` |

The native path freezes this order:

`session -> params/query validation -> active workspace/effective permission ->
deployment/Enterprise/AppConfig gate -> workspace admin -> read`

The PostgreSQL adapter preserves all four involvement rules:

1. the row belongs to the requested workspace;
2. `metadata.childWorkspaceId` names the requested workspace;
3. `metadata.otherWorkspaceId` names the requested workspace;
4. a live child owns a legacy `fork_sync` or `fork_rollback` row.

It also preserves the complete status allowlist, `updatedAt DESC, id DESC`, `limit + 1`,
the PostgreSQL timestamp-text cursor, and the donor behavior that treats an invalid cursor as the
first page. Repeated scalar query keys are preserved as arrays at the transport/application seam,
so both `?cursor=a&cursor=b` and `?limit=1&limit=100` fail the V1 string schema with the donor
`400 {"error":"Validation error","details":[...]}` response. Session authentication still
precedes this validation, and invalid repeated values never reach workspace access or persistence.

## Security and browser closure

The V1 response schema re-parses the adapter result and strips unknown metadata. The real database
fixture proves that `secretToken`, unrelated-tenant rows, archived-child rows, and unrelated
child-work kinds do not cross the boundary. It now also places page boundaries between identical
PostgreSQL timestamps and between `...123456`/`...123455` timestamps that collapse to the same
JavaScript millisecond. The cursor retains all six fractional digits. A Drizzle query logger
observes the actual SQL and ratchets exactly one live-child query plus one background-work query
for both the small fixture and a 257-row fixture.

The dedicated browser build closes over the actual hook, focused wrapper, and versioned contract.
It is 2,908 gzip bytes and contains no DB/Drizzle, Next server, Registry, Executor, Sandbox, or
Node crypto markers. The old monolithic contract is explicitly forbidden by the gate.

## Frontend compile performance

The API-1009 client seam now has a source-bound cold/incremental compile runner:

```powershell
bun run measure:api-1009-frontend-compile
bun run check:api-1009-frontend-compile
bunx vitest run scripts/architecture/performance/api-1009-frontend-compile-ratchet.test.ts
```

The runner starts a fresh Vite watch build from the real
`apps/sim/ee/workspace-forking/hooks/background-work.ts` entry. After the first bundle it appends
a valid TSDoc probe to that exact tracked hook, waits for the next watch bundle, restores the
original source, and refuses success unless the restored SHA-256 equals the original. The raw
sample is bound to the hook, Sim wrapper, package contract, and measurement-tool hashes in
`docs/testing/evidence/api-1009-frontend-compile-raw.json`.

| Focused sample | Observed | Ratchet ceiling |
| --- | ---: | ---: |
| Cold compile | 97 ms | 2,000 ms |
| Incremental compile after hook edit | 36 ms | 750 ms |

The package contract measurement has been corrected from the stale 3,877-byte value to the actual
3,873 bytes (`daccbf18...af9`). The ratchet is wired into the root package and the test-build CI
workflow. Raising either ceiling requires new raw evidence and independent performance review.
This was a shared integration worktree: another agent's `bunx tsc --noEmit` was active during the
final capture, and a separate Next dev server on port 3110 was observed during the wider evidence
window. The sample is real and source-bound, but it is not presented as a stable cross-machine
baseline. A concurrent verification run reached 1,025 ms cold and showed that the initial 1,000 ms
ceiling was narrower than the shared-runner noise. The final fixed 2,000/750 ms ceilings leave
runner headroom while still failing a multi-second cold or near-target incremental regression, and
remain stricter than the project's 10,000/1,000 ms targets.

This focused result does not hide the current whole-page problem. A separate Next 16 Turbopack
attempt against `/workspace/api1009-perf/settings/forks` recorded an 84,067.2 ms `compile-path`,
a 92,907.36 ms request, and 9,109,176,320 bytes RSS. The route returned 500 because the shared
workspace layout still reaches `remote-sandbox/daytona.ts` and the local `@daytona/sdk`
installation has no `esm`/`cjs` payload. Therefore no successful Next incremental compile,
page-open, or key-interaction sample is claimed. The exact command, source chain, trace values,
failure, and claim limit are in
`docs/testing/evidence/api-1009-next-route-cold-attempt-raw.json`.

## Verification

- API contract suites: 27/27; focused workspace-background-work contract: 4/4
- focused API-1009 auth/tenant/error/native-routing suite: 11/11
- full API suite: 203 passed, 5 skipped
- disposable PostgreSQL 16 fixture: 1/1, including same-time/sub-ms pagination and 2-query ratchet
- focused API and Sim client TypeScript projects: pass
- full API and full Sim TypeScript: pass
- API production build: pass, native API-1009 adapter present
- Workspace Forking boundary: 17 module files, 8 adapters, 2 contracts, no violations
- target structure: 57 module roots, 100 required files
- W2 coverage: 22/22 C/A/D/I metadata
- W2 facade isolation: 22/22, largest 1,485 gzip bytes
- API-1009 client closure: 2,898 gzip bytes
- API-1009 focused Vite compile: 97 ms cold / 36 ms incremental
- API-1009 compile ratchet: passed at 2,000 ms cold / 750 ms incremental
- API-1009 compile ratchet tests: 2/2
- browser runtime closure, lightweight surfaces, strict API validation, Biome, and diff check: pass

The compile ratchet must be run without deliberately parallelizing unrelated full suites. An
intentional parallel stress invocation produced a 1,387 ms incremental sample and correctly
failed the 750 ms ceiling; the current isolated command passed at 87/34 ms. The raw
97/36 ms evidence remains the source-bound recorded sample, while the fixed ceiling—not a single
shared-runner wall-clock value—is the regression policy.

## Independent review

Status: `pending-independent-re-review`.

The reviewer must rerun the commands above, compare the donor route/store behavior, inspect the
four-way tenant scope and exact keyset cursor, verify production composition selects API-1009
without the legacy backend, and confirm the real hook has no path back to the workspace-fork
monolith. Only an approved review may move API-1009 into `completedInventoryIds`.

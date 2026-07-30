# W2 API-1009 native workspace background work

## Outcome

`GET /api/workspaces/[id]/background-work` now has a native Workspace Forking deep module,
a production PostgreSQL adapter, and a focused browser contract. The implementation is complete
but remains outside the strict accepted-progress count until an independent agent approves it.

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
first page.

## Security and browser closure

The V1 response schema re-parses the adapter result and strips unknown metadata. The real database
fixture proves that `secretToken`, unrelated-tenant rows, archived-child rows, and unrelated
child-work kinds do not cross the boundary.

The dedicated browser build closes over the actual hook, focused wrapper, and versioned contract.
It is 2,908 gzip bytes and contains no DB/Drizzle, Next server, Registry, Executor, Sandbox, or
Node crypto markers. The old monolithic contract is explicitly forbidden by the gate.

## Verification

- focused API contract and compatibility suites: 19/19
- focused API-1009 auth/tenant/error/native-routing suite: 8/8
- full API suite: 181 passed, 3 skipped
- disposable PostgreSQL 16 fixture: 1/1
- focused API TypeScript project: pass
- focused Sim TypeScript project: pass in under one second after removing the type-only barrel
- Workspace Forking boundary: 17 module files, 8 adapters, 2 contracts, no violations
- target structure: 57 module roots, 100 required files
- W2 coverage: 22/22 C/A/D/I metadata
- W2 facade isolation: 22/22, largest facade 1,485 gzip bytes
- API-1009 client closure: 2,908 gzip bytes

The full API TypeScript command is currently blocked by missing workspace dependencies for
`@aws-sdk/client-appconfigdata` and the installed Better Auth adapter version. The full Sim
TypeScript command was run with an 8 GiB heap; its result must be recorded separately because the
workspace lacks optional A2A, AWS, Azure, Anthropic, Daytona, and related SDK packages. Focused
projects are evidence for this slice, not a substitute for a green full-repository type-check.

## Independent review

Status: `pending-independent-review`.

The reviewer must rerun the commands above, compare the donor route/store behavior, inspect the
four-way tenant scope and exact keyset cursor, verify production composition selects API-1009
without the legacy backend, and confirm the real hook has no path back to the workspace-fork
monolith. Only an approved review may move API-1009 into `completedInventoryIds`.

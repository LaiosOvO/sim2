# W2 API-1037 native workspace fork resources

## Outcome

`GET /api/workspaces/[id]/fork/resources` now has a native Workspace Forking deep module and a
production PostgreSQL adapter. The browser-facing contract contains only copyable identifiers,
labels, file-folder metadata, and the deployed-workflow count. It cannot expose MCP credentials,
headers, custom-tool code/schema, Skill content, Registry, Executor, or Sandbox implementations.

Independent re-review approved the functional route on 2026-07-30, so API-1037 is now in the
strict accepted-progress ledger. Global Sim/Sandbox/Next build failures remain explicitly separate
frontend-build milestone blockers.

## Deep-module boundary

- Interface: `GetForkResourcesUseCase.execute`
- Persistence seam: `WorkspaceForkResourceCatalogReader.readCopyable`
- Implementation: `createDrizzleWorkspaceForkResourceCatalogReader`
- HTTP adapter: `createGetForkResourcesHandler`
- Versioned contract: `GetForkResourcesResponseV1`

The catalog reader owns eight fixed, parallel queries. Seven resource families use the donor V1
limit of 1,000; deployed workflow counting requires an active deployment version and excludes
archived or fork-sync-excluded workflows. There is no resource-count-dependent query loop.

## Compatibility and security

The route preserves:

`session -> params validation -> active workspace/effective permission -> deployment/Enterprise/
AppConfig gate -> admin -> resource projection`

Sim2 uses the generic `folder` table with `resourceType='file'`; that mainline behavior is frozen
instead of Polaris's older `workspaceFileFolder` helper. Files whose folder was deleted or is not a
file folder keep the stored `folderId` but return `folderName: null`, matching the donor left join.

The current V1 response does not report whether any 1,000-item family was truncated. That donor
limitation is preserved for wire compatibility and must be corrected only in a V2 contract with
pagination or an explicit `truncated` field.

## Verification

- focused API-1037 suite: 7/7
- API contract compatibility suite: 16/16
- full API suite: 138 passed, 1 skipped
- disposable PostgreSQL 16 fixture: 1/1
- API TypeScript type-check: pass
- Workspace Forking boundary: 14 module files, 7 adapters, no violations
- target structure: 57 module roots, 93 required files
- API build: 1,149 modules, 35.52 KiB entry

The real PostgreSQL fixture verifies live/deleted/wrong-kind file folders, archived/deleted resource
filters, active deployment counting, and asserts that `must-not-leak` secrets and private Skill
description/content never appear in the serialized catalog.

## Independent review

Status: `changes-required remediated; pending independent re-review`.

The reviewer must compare Sim2 and Polaris donor semantics, rerun the commands above, inspect the
eight queries for tenant/filter parity, and confirm the browser closure before API-1037 is added to
the accepted migration ledger.

## Review remediation

The cross-workspace folder join is now tenant-qualified. The disposable PostgreSQL fixture includes
a source-workspace file pointing at a live folder owned by another workspace and proves that the
stored `folderId` remains visible while `folderName` is null. The handler fixtures also freeze the
donor `{error, requestId}` body for typed 403/404 results.

The production adapter accepts an optional Drizzle database only at its infrastructure factory.
Production composition uses the default database; the PostgreSQL fixture supplies an instrumented
client and observes exactly eight SELECT statements at 4, 1,000, and 1,001 eligible files. The
1,000-item input returns 1,000 and the 1,001-item input remains capped at 1,000. Source-bound raw
evidence is stored in `docs/testing/evidence/api-1037-postgres-boundary-raw.json`.

The actual `ForkWorkspaceModal` now imports the focused resource/create hooks and contracts rather
than the 816-line monolith. The modal, resource picker, and file tree use the focused
`@sim/emcn/workspace-fork` UI entry, which exposes only the required components and direct Lucide
icons. The lightweight surface ratchet forbids the monolithic hook/contract, EMCN package root, and
Lucide root barrel.

The real modal has a reproducible jsdom journey:

```text
bunx vitest run \
  ee/workspace-forking/components/fork-workspace-modal/fork-workspace-modal.interaction.test.tsx

2 tests passed:
  focused response hydrate/default selection -> user deselection -> exact create payload
  Fork remains disabled until resources resolve
```

The source-bound Vite watch runner edits and restores the real modal entrypoint:

```text
bun run measure:api-1037-frontend-compile
  cold 1,094 ms
  incremental 354 ms
  original and restored SHA-256 match

bun run check:api-1037-frontend-compile
  cold 529 ms / 5,000 ms
  incremental 192 ms / 1,000 ms
```

Raw evidence is `docs/testing/evidence/api-1037-frontend-compile-raw.json`; the fixed budget is
`docs/testing/api-1037-frontend-compile-budget.json`. Both package scripts are wired into the root
package and the check is a required CI step.

Final implementation verification before independent re-review:

```text
API-1037 focused: 7/7
API full: 212 passed, 5 skipped
API type-check/build: passed; 1,066 build modules
API contracts: 27/27; type-check passed
Sim focused resource/interaction/boundary: 11/11
full Sim and EMCN type-check: passed
disposable PostgreSQL 16: passed; container removed
Workspace Forking boundary: 17 module files, 8 adapters, passed
W2 coverage/facades/proxy types: passed
contract purity/browser build: passed
target structure/cycles/API standalone/strict validation: passed
browser runtime closure: execution-and-sandbox 239, zero violations
```

No accepted-ledger change is part of this handoff. A different reviewer must still inspect and
approve the remediation.

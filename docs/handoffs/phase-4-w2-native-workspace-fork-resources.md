# W2 API-1037 native workspace fork resources

## Outcome

`GET /api/workspaces/[id]/fork/resources` now has a native Workspace Forking deep module and a
production PostgreSQL adapter. The browser-facing contract contains only copyable identifiers,
labels, file-folder metadata, and the deployed-workflow count. It cannot expose MCP credentials,
headers, custom-tool code/schema, Skill content, Registry, Executor, or Sandbox implementations.

The implementation is complete and tested, but remains outside the strict accepted-progress ledger
until an independent agent review is recorded under the migration review policy.

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

Status: `pending`.

The reviewer must compare Sim2 and Polaris donor semantics, rerun the commands above, inspect the
eight queries for tenant/filter parity, and confirm the browser closure before API-1037 is added to
the accepted migration ledger.


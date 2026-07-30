# API-1037 independent review

Result: **changes-required**

Route: `GET /api/workspaces/[id]/fork/resources`

Implementation: API-1037 concurrent implementation agent  
Independent reviewer: `/root/api1032_donor_audit`  
Review date: 2026-07-30

The reviewer did not implement API-1037. This review follows
`docs/testing/migration-independent-review-policy.md`. API-1037 must not enter the accepted-route
ledger until the blocking findings below are fixed and independently rechecked.

## Blocking findings

### 1. Cross-workspace folder label can cross the tenant boundary

Priority: high

`apps/api/src/infrastructure/postgres/repositories/drizzle-workspace-fork-resource-catalog-reader.ts:35-41`
joins a file folder by:

- `workspaceFiles.folderId = folder.id`;
- `folder.resourceType = 'file'`;
- `folder.deletedAt IS NULL`.

It does not require `folder.workspaceId = workspaceId`. This is not protected by a database
constraint: `packages/db/schema.ts:2039-2046` explicitly documents that
`workspace_files.folder_id` currently has no foreign key while the generic-folder migration is in
flight. A stale, corrupt, or crafted row can therefore return another workspace's `folder.name` to
the current workspace admin.

The Sim2 donor has the same missing predicate, but the independent-review policy requires tenant
isolation rather than preserving a donor data leak. Add the workspace predicate to the join and a
real PostgreSQL fixture where a source-workspace file references a live file folder owned by
another workspace. The required result is to preserve the stored `folderId` but return
`folderName: null`.

### 2. The browser consumer still compiles the legacy monolithic fork contract/hook

Priority: high

The new pure contract exists at `packages/api-contracts/src/workspace-forking.ts`, but no file under
`apps/sim` imports `@sim/api-contracts/workspace-forking`. The actual fork modal still reaches:

- `apps/sim/ee/workspace-forking/hooks/workspace-fork.ts:3-20`, which imports the runtime
  `getForkResourcesContract` together with all fork/promote/mapping/diff contracts;
- `apps/sim/lib/api/contracts/workspace-fork.ts`, currently 816 lines / 35,173 bytes;
- a combined 11,003-byte hook containing resource reads plus all fork mutations and cache effects.

The Next route facade is now small and clean, but the affected client surface has not moved to the
new focused contract and its compile closure has not been reduced. This does not satisfy the
project's primary frontend-performance outcome.

Split the resource query into a focused client hook/contract entry that consumes the versioned
workspace-forking contract subpath. Record cold and incremental compile plus fork-modal
page-open/interactivity measurements under `docs/testing/evidence/`, with a regression ratchet.

### 3. Typed 403/404 response bodies drift from the donor

Priority: medium

The donor throws `ForkError` for workspace-not-found, deployment-disabled, enterprise-required,
and admin-required. `withRouteHandler.ts:85-92` serializes those errors as:

```json
{"error":"...","requestId":"..."}
```

The native handler at
`apps/api/src/modules/workspace-forking/interface/create-get-fork-resources-handler.ts:47-64`
returns only `{"error":"..."}` for the same cases. The `x-request-id` header is present through the
standalone API wrapper, but the donor body field is still missing. No versioned behavior-change
decision approves this wire drift.

Restore the donor body shape or record an explicit, versioned platform decision and update the
contract/differential fixtures accordingly. The direct 401 and validation 400 bodies already
match the donor's no-`requestId` behavior.

### 4. Required edge/performance evidence is incomplete

Priority: medium

The production code visibly has seven `LIMIT 1000` list queries and one bounded count query, but
the PostgreSQL fixture does not test:

- the 1000/1001 boundary;
- the cross-workspace folder case above;
- fixed query count as row count increases.

In addition, the repository-wide browser closure gate currently fails:

```text
zeroBudgetViolations:
  executor:
    apps/sim/app/workspace/[workspaceId]/settings/components/secrets/components/secrets-manager/secrets-manager.tsx
```

The failure is outside the API-1037 files, and this review observed `api-or-worker: 0` plus a clean
API-1037 Next facade. Nevertheless, the migration policy requires a passing regression gate; the
accepted ledger cannot cite a failing command as completion evidence. There is also no
`docs/testing/evidence/` directory containing the required frontend timing measurements.

## Donor and compatibility review

The donor review used both reference repositories, not the refactor copy:

- `D:\workspace\workflow\sim2`
- `D:\polaris`

SHA256 comparison:

| Donor file | Sim2 vs Polaris |
| --- | --- |
| route | identical |
| fork authz | identical |
| wire contract | identical |
| resource mapping | different only at the file-folder table seam |

Sim2 uses the generic `folder` table and requires `resourceType='file'`; Polaris uses the legacy
`workspaceFileFolder` table. Choosing the Sim2 generic-folder model is correct because Sim2 is the
target/mainline base.

Compatibility matrix:

| Concern | Donor | Native | Review |
| --- | --- | --- | --- |
| Method/path | GET, exact path | GET, exact W2 route | match |
| Params | decoded non-empty string | decoded non-empty string | match |
| Auth | session user | session user | match |
| Precedence | session → params → active workspace/effective permission → deployment/plan/AppConfig → admin → resources | same | match |
| Success status/wire | 200, seven required arrays plus integer count | same V1 schema | match |
| Files | workspace/context/deleted filters, left join active file folder, row id | same except missing tenant join inherited from donor | security fix required |
| Tables | workspace, non-archived, limit 1000 | same | match |
| Knowledge bases | workspace, non-deleted, limit 1000 | same | match |
| Custom tools | workspace, narrow id/title, limit 1000 | same | match |
| Skills | workspace, narrow id/name, limit 1000 | same | match |
| External MCP | workspace, non-deleted, narrow id/name, limit 1000 | same | match |
| Workflow MCP | workspace, non-deleted, narrow id/name, limit 1000 | same | match |
| Deployed count | deployed, not excluded, not archived, active version exists | same correlated EXISTS | match |
| Typed error body | error + requestId | error only | drift |

The resource adapter uses explicit projections. MCP headers/OAuth client secret, custom-tool
schema/code, Skill description/content, credentials, environment variables, workflow state,
Registry, Executor, and Sandbox are not selected or returned. The live PostgreSQL sentinel test
confirmed that secret/code/content values do not appear in serialized output.

## Verification performed

Passing:

```text
focused API-1037: 7/7
API contracts: 18/18
full API: 167 passed, 2 skipped
disposable PostgreSQL 16: 1/1
API type-check: passed
Workspace Forking boundary: 14 module files, 7 adapters, passed
W2 inventory/coverage: 22/22, passed
W2 Next facade isolation: 22 entries, largest 1,485 gzip bytes, passed
target structure: 57 module roots, 93 required files, passed
contract purity/browser build: passed, 200-byte contract build
API build: 1,149 modules, 35.52 KiB entry
browser bundle policy: passed
```

Failing:

```text
browser runtime closure: failed because of the executor zero-budget violation recorded above
```

The PostgreSQL test was rerun against a dedicated temporary `postgres:16-alpine` container with
`SIM_TEST_DATABASE_DISPOSABLE=1`; the container was removed after the successful run.

## Re-review requirements

1. Add the folder workspace predicate and cross-tenant PostgreSQL fixture.
2. Resolve or explicitly version the typed 403/404 body drift.
3. Move the actual resource client onto a focused versioned contract/hook and provide frontend
   timing evidence.
4. Add 1000/1001 and fixed-query evidence.
5. Re-run the browser runtime closure gate from a clean integration state.
6. Request a new independent review; do not change the accepted-route ledger before approval.

# API-1037 independent re-review

Result: **approved (functional route)**

Route: `GET /api/workspaces/[id]/fork/resources`

Implementation: API-1037 implementation/remediation agent

Independent reviewer: `/root/api1037_independent_rereview`

Review date: 2026-07-30

The reviewer did not implement or remediate API-1037. This re-review independently inspected the
final implementation, the Sim2 and Polaris donors, the real PostgreSQL boundary, the actual fork
modal consumer, and the source-bound frontend evidence. API-1037 may enter the accepted functional
route ledger. This approval does **not** approve the overall Next/frontend-performance milestone;
the global Next and full-Sim failures recorded below remain separate work.

## Re-review decision

All four findings from the first independent review are resolved:

1. The file-folder left join is tenant-qualified with `folder.workspaceId = workspaceId`. A fresh
   PostgreSQL 16 fixture proves that a source-workspace file referencing another workspace's live
   folder preserves `folderId` but returns `folderName: null`.
2. Typed workspace-not-found, deployment-disabled, Enterprise-required, and admin-required
   responses now preserve the donor `{ error, requestId }` body.
3. The real `ForkWorkspaceModal` imports focused resource/create hooks and contracts rather than
   the 816-line contract and 11 KB hook monoliths. The modal, resource picker, and file tree import
   `@sim/emcn/workspace-fork`, not EMCN or Lucide root barrels.
4. PostgreSQL verifies the exact 1,000/1,001 cap and eight SELECT statements per read. The focused
   Vite watch runner has raw, source-hashed cold/incremental evidence, a fixed budget, package
   commands, and a required CI step.

No accepted-ledger or implementation file was changed by this reviewer.

## Donor compatibility

The donor review read both reference repositories:

- `D:\workspace\workflow\sim2`
- `D:\polaris`

The route, authorization module, and monolithic wire-contract donor files are byte-identical
between Sim2 and Polaris. Their resource-mapping implementations differ only at the file-folder
storage seam: Sim2 uses the generic `folder` table while Polaris still uses the legacy file-folder
table. Sim2 is the target/mainline donor, so the native adapter correctly retains the generic
folder model.

| Concern | Donor/native result |
| --- | --- |
| Method/path | exact GET route |
| Params | decoded, non-empty workspace id |
| Auth | session user only |
| Precedence | session -> params -> active workspace/access -> deployment/plan/AppConfig -> admin -> catalog |
| Success wire | seven required resource arrays plus integer deployed-workflow count |
| Typed 403/404 | donor-compatible `{ error, requestId }` |
| Files | workspace/context/deleted filters; active file-folder left join; tenant-qualified |
| Other families | workspace-scoped; donor archive/deleted filters; seven `LIMIT 1000` reads |
| Deployment count | deployed, not excluded, not archived, with active deployment version |
| Query behavior | eight parallel SELECT statements independent of returned row count |

The adapter uses explicit projections. MCP headers/OAuth secrets, custom-tool schema/code, Skill
description/content, credentials, environment variables, workflow state, Registry, Executor, and
Sandbox implementations are neither selected nor returned. The PostgreSQL sentinel fixture also
asserts that secret/code/content values do not appear in the serialized response.

## Frontend boundary and interaction

The actual modal closure now uses:

- `apps/sim/ee/workspace-forking/hooks/use-fork-resources.ts`
- `apps/sim/ee/workspace-forking/hooks/use-fork-workspace.ts`
- `apps/sim/lib/api/contracts/workspace-fork-resources.ts`
- `apps/sim/lib/api/contracts/workspace-fork-create.ts`
- `@sim/api-contracts/workspace-forking`
- `@sim/emcn/workspace-fork`

The focused interaction journey verifies resource hydration/default selection, a user
deselection, the exact create-fork payload, disabled submission before resource resolution,
modal close after success, the `Open fork` toast action, and navigation to
`/workspace/fork-1/w`.

The lightweight build ratchet reports:

```text
workspace-fork-modal:        195,513 gzip bytes, 340 inputs
workspace-fork-resources:     82,609 gzip bytes, 105 inputs
workspace-fork-create:        86,705 gzip bytes, 118 inputs
forbidden monolith/UI/icon inputs: none
server-heavy runtime leakage: none
```

Browser runtime closure passes with `api-or-worker: 0`, `infra-extensions: 0`, and no zero-budget
violations. The repository-wide `execution-and-sandbox` count is 239; API-1037 does not introduce
one of those roots.

## Performance evidence

Final raw evidence:

- `docs/testing/evidence/api-1037-frontend-compile-raw.json`
- `docs/testing/api-1037-frontend-compile-budget.json`
- `docs/testing/evidence/api-1037-postgres-boundary-raw.json`

The final raw frontend sample is:

```text
cold:        1,094 ms / 5,000 ms budget
incremental:   354 ms / 1,000 ms budget
```

Independent hash verification found:

- measurement runner SHA matches the raw evidence;
- every listed source-closure SHA matches the final source;
- the final interaction-test SHA is
  `304ea4afecc9b59c219ee11a20bb6c1678f66fe5d72e01d474156ca7c8d06434`;
- original/restored modal SHA values match after the append/restore invalidation;
- PostgreSQL adapter and fixture SHA values match the database evidence.

An independent rerun of the ratchet passed at 445 ms cold and 157 ms incremental. These timings
measure the real fork-modal source closure with focused Vite watch compilation. They are not a
claim that the full Next application or authenticated page-open SLO is complete.

## Verification performed

Passing:

```text
API-1037 focused: 7/7
full API Vitest: 224 passed, 5 skipped
API contracts: 27/27; type-check passed
Sim focused modal/hook/contract/boundary: 11/11
Sim type-check: passed
API type-check/build: passed; 1,074 build modules
fresh disposable PostgreSQL 16: 1/1; container removed
Workspace Forking boundary: 17 module files, 8 adapters, passed
W2 coverage: 22/22
W2 facade isolation: 22 entries, largest 1,485 gzip bytes
W2 proxy type-check: passed
contract purity/browser build: passed; 200-byte browser contract build
target structure/cycles/API standalone: passed
strict API validation: 991/991 Zod-backed, zero non-Zod
lightweight client surfaces: passed
browser runtime closure: passed; zero violations
API-1037 Vite cold/incremental ratchet: passed
```

The PostgreSQL integration was rerun against a newly created `postgres:16-alpine` container with
`SIM_TEST_DATABASE_DISPOSABLE=1`. It passed and the disposable container was removed.

## Separate global failures and Next milestone

API-1037 is functionally approved under the policy's functional-route/frontend-milestone
separation. The following repository-wide failures were reproduced and must not be reported as
API-1037 or overall frontend success:

1. `bun run build` in `apps/sim` stops before Next compilation because the global sandbox-bundle
   builder returns `AggregateError: Bundle failed`.
2. A direct `next build` reaches the application compile but fails in the unrelated
   `@earendil-works/pi-ai` / `@google/genai` dependency graph because `ResourceScope` is not
   exported by the installed `@google/genai`.
3. The monolithic Sim Vitest run is not green in this worktree. Isolated reproduction confirms an
   existing DNS-resolution expectation failure in `lib/core/security/input-validation.test.ts`
   and a `jiti/static` package-export failure while importing
   `executor/handlers/pi/cloud-review-tools.test.ts`.

None of those failure stacks imports an API-1037 implementation or focused fork-modal file. The
route-focused tests, real PostgreSQL boundary, API build, Sim type-check, focused browser build,
compile ratchet, and closure gates all pass. Therefore they do not reverse this functional-route
approval, but they continue to block the global Next build/page-open performance milestone and
must remain visible in the overall progress document.

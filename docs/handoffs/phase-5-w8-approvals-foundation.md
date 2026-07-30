# Phase 5 W8 approvals foundation handoff

Date: 2026-07-30

Status: remediation-in-progress-frozen after `changes-required`; not accepted in the API migration ledger.

## Scope

This checkpoint migrates the first eight Polaris approval APIs:

| API | Method and path | Target |
| --- | --- | --- |
| API-0002 | `POST /api/approvals/[approvalId]/decisions` | Native API approval module plus thin Next proxy |
| API-0003 | `POST /api/approvals/[approvalId]/resume` | Native API command -> Worker execution command |
| API-0004 | `GET /api/approvals/audit-logs` | Native tenant-scoped audit query |
| API-0005 | `POST /api/approvals/definitions/[definitionId]/versions/[versionId]/publish` | Native definition lifecycle |
| API-0006 | `POST /api/approvals/definitions/[definitionId]/versions` | Native immutable version creation |
| API-0007 | `GET\|POST /api/approvals/definitions` | Native definition query/create |
| API-0009 | `GET /api/approvals` | Native instance query |
| API-0010 | `POST /api/approvals/start` | Native idempotent start |

The exact donor hashes and compatibility audit are recorded in `.scratch/sim2-platform-separation/issues/38-w8-approval.md`.

## Ownership and dependency direction

```text
Browser
  -> focused Next contract/proxy facade
  -> apps/api approval application module
     -> extensions/biz/approval state machine
     -> Drizzle approval repositories/audit/access
     -> versioned execution commands
        -> Worker resume runner
        -> Worker durable effect outbox
           -> future Feishu/Meegle adapters
```

- `packages/api-contracts` owns pure wire schemas and route metadata.
- `extensions/biz/approval` owns approval graph and decision semantics.
- `apps/api/src/modules/approvals` owns use-case orchestration, authorization and ports.
- `packages/db` owns the native approval tables and migration.
- `packages/execution-contracts` owns API-to-Worker commands.
- `apps/worker` owns execution-service delegation and durable effect admission.
- `apps/sim` owns only focused browser contracts, queries, UI and thin original-path facades.

Feishu, Meegle, Executor, Sandbox, registry, encryption and DB runtime imports are prohibited from the browser dependency closure. Feishu/Meegle delivery remains an outbound effect adapter concern, not approval-domain truth.

## Behavioral compatibility

- Authentication runs before request parsing.
- Workspace read/write/admin and organization menu/permission/data-scope policies are composed by the API module.
- Organization owner/admin remains an explicit bypass path.
- Start is idempotent on `(executionId, contextId)`.
- Decisions are immutable; duplicate and late decisions return stable recovery semantics.
- Definition versions are immutable and publishing follows the native lifecycle.
- Definition, instance, decision and retry/resume operations write audit records.
- Resume reaches a configured execution service through Worker; it is not a dead queue.
- Delivery effects are durably admitted to `approval_effect_outbox`.

`project_member` data scope currently fails closed. It must later use the stable PM membership port created by the PM migration; it must not query a second ad-hoc membership model.

## Database and migration

`packages/db/migrations/0276_approval_domain.sql` was generated with Drizzle and is registered in `packages/db/migrations/meta/_journal.json`.

A disposable `pgvector/pgvector:pg16` database executed the full migration chain and the native approval fixture. The fixture verified tenant list isolation, start idempotency, immutable single decisions, terminal state, resume claim and late duplicate behavior. The temporary container was removed after verification.

## Verification snapshot

| Gate | Result |
| --- | --- |
| API validation strict | `1000/1000`, non-Zod `0`, approvals `8/8` |
| Focused contract/domain/API/Worker/proxy tests | Pass |
| Native PostgreSQL fixture | Pass on disposable PostgreSQL 16 + pgvector |
| Focused package TypeScript | Pass |
| Browser forbidden dependency closure | `0` hits |
| Focused browser build | `40.5 ms` on the final check; `283004` raw; `68214` gzip |

Evidence:

- `docs/testing/w8-approvals-frontend-compile-budget.json`
- `docs/testing/evidence/w8-approvals-frontend-compile-raw.json`
- `apps/api/tests/w8/native-approvals.postgres.test.ts`
- `scripts/check-api-validation-approvals-proxy.test.ts`

The final focused non-PostgreSQL run passed 27 tests: 4 API-contract, 4 state-machine, 2 execution-command, 2 Worker, 11 API, 3 proxy and 1 strict-regression test. The PostgreSQL fixture was additionally run and passed against the disposable migrated database; its environment-gated rerun is skipped when `DATABASE_URL` is absent.

## Exact file inventory

W8-owned files:

```text
apps/api/src/modules/approvals/application/create-approvals-module.ts
apps/api/src/modules/approvals/errors.ts
apps/api/src/modules/approvals/index.ts
apps/api/src/modules/approvals/infrastructure/drizzle-approval-access.ts
apps/api/src/modules/approvals/infrastructure/drizzle-approval-audit.ts
apps/api/src/modules/approvals/infrastructure/drizzle-approval-repository.ts
apps/api/src/modules/approvals/infrastructure/http-worker-approval-effects.ts
apps/api/src/modules/approvals/infrastructure/http-worker-approval-resume-command.ts
apps/api/src/modules/approvals/ports.ts
apps/api/tests/w8/approval-import-boundary.test.ts
apps/api/tests/w8/approvals-donor-parity.test.ts
apps/api/tests/w8/approvals-module.test.ts
apps/api/tests/w8/native-approvals.postgres.test.ts
apps/sim/app/api/approvals/[approvalId]/decisions/route.ts
apps/sim/app/api/approvals/[approvalId]/resume/route.ts
apps/sim/app/api/approvals/audit-logs/route.ts
apps/sim/app/api/approvals/definitions/[definitionId]/versions/[versionId]/publish/route.ts
apps/sim/app/api/approvals/definitions/[definitionId]/versions/route.ts
apps/sim/app/api/approvals/definitions/route.ts
apps/sim/app/api/approvals/route.ts
apps/sim/app/api/approvals/start/route.ts
apps/sim/app/workspace/[workspaceId]/approvals/page.tsx
apps/sim/hooks/queries/approvals.ts
apps/sim/lib/api-proxy/w8-approvals.test.ts
apps/sim/lib/api-proxy/w8-approvals.ts
apps/sim/lib/api/contracts/approvals.ts
apps/worker/src/jobs/approval/drizzle-approval-effects-sink.ts
apps/worker/src/jobs/approval/effects.ts
apps/worker/src/jobs/approval/http-approval-resume-runner.ts
apps/worker/src/jobs/approval/types.ts
apps/worker/src/jobs/approval/unavailable-approval-resume-runner.ts
apps/worker/tests/jobs/approval-commands.test.ts
docs/handoffs/phase-5-w8-approvals-foundation.md
docs/testing/evidence/w8-approvals-frontend-compile-raw.json
docs/testing/w8-approvals-frontend-compile-budget.json
extensions/biz/approval/src/state-machine.test.ts
extensions/biz/approval/src/state-machine.ts
packages/api-contracts/src/approvals.ts
packages/api-contracts/tests/approvals.test.ts
packages/db/migrations/0276_approval_domain.sql
packages/db/migrations/meta/0276_snapshot.json
packages/execution-contracts/src/approval-effects.ts
packages/execution-contracts/src/approval-resume.ts
packages/execution-contracts/tests/approval-commands.test.ts
scripts/architecture/performance/w8-approvals-client-ratchet.ts
scripts/check-api-validation-approvals-proxy.test.ts
```

Shared files containing W8 hunks:

```text
.github/workflows/test-build.yml
.scratch/sim2-platform-separation/issues/38-w8-approval.md
apps/api/package.json
apps/api/src/bootstrap/application/create-api-application.ts
apps/api/src/bootstrap/composition/create-production-api-options.ts
apps/worker/package.json
apps/worker/src/bootstrap/application/create-worker-application.ts
apps/worker/src/http/create-worker-http-server.ts
apps/worker/src/roles/execution/start-execution-role.ts
docs/migration/module-alignment-matrix.md
extensions/biz/approval/package.json
extensions/biz/approval/src/index.ts
package.json
packages/api-contracts/package.json
packages/api-contracts/src/index.ts
packages/db/migrations/meta/_journal.json
packages/db/schema.ts
packages/execution-contracts/package.json
packages/execution-contracts/src/index.ts
scripts/check-api-validation-contracts.ts
```

The worktree contains other agents' changes in several shared files. Review or checkpoint W8 by hunk; do not restore or overwrite unrelated changes.

## Independent review checklist

The reviewer must be a different agent from the implementer and must:

1. compare all eight routes to the frozen donor hashes and fixtures;
2. audit authentication-before-parse, tenant isolation, role/menu/permission/data-scope behavior and fail-closed paths;
3. review transaction, uniqueness and concurrent decision/resume behavior;
4. verify API-to-Worker command versioning, configured execution delegation and durable effect admission;
5. rerun focused tests, strict validation, TypeScript and browser closure/performance gates;
6. record findings without marking routes accepted until blocking findings are resolved.

## Resume point

After independent review, fix any blocking findings, rerun the gates above, then update the accepted API ledger in a separate reviewed checkpoint. Do not broaden this slice with PM membership, provider SDKs or delivery implementations before that gate.

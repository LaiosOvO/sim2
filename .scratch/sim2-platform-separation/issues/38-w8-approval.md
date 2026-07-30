# 迁移 W8.3 Approval

What to build: 迁移 W8 Approval 子波次的 8 条路由与定义、实例、决策、等待订阅。
Blocked by: 35, 36
Status: remediation-in-progress-frozen

## What to build

Approval domain 通过 channel port 发送/接收，决策命令支持幂等与审计，并能恢复等待中的 workflow。

## Acceptance criteria

- selector 精确为 8 条。
- approve/reject/timeout/duplicate callback/late decision/permission 与 audit tests 通过。
- 不直接导入 Feishu SDK；恢复经 execution contract 调用 Worker。
- C/A/D/I/E/R/S 测试与 coverage report 通过。

## Blocked by

35、36。

## 2026-07-30 donor audit

Scope is fixed to the first eight Polaris approval routes:

- API-0002 `POST /api/approvals/[approvalId]/decisions`
- API-0003 `POST /api/approvals/[approvalId]/resume`
- API-0004 `GET /api/approvals/audit-logs`
- API-0005 `POST /api/approvals/definitions/[definitionId]/versions/[versionId]/publish`
- API-0006 `POST /api/approvals/definitions/[definitionId]/versions`
- API-0007 `GET|POST /api/approvals/definitions`
- API-0009 `GET /api/approvals`
- API-0010 `POST /api/approvals/start`

Polaris route snapshots were read-only audited. Source SHA-256 values:

| API | SHA-256 |
| --- | --- |
| API-0002 | `efd05c703434b23952f08b4d144a996c54094eefb21cd6de84c6cdccf8288c1a` |
| API-0003 | `03e84d8820947edcbb4121c41306cd731639a8be97591d638d7c60e97348fa79` |
| API-0004 | `221fa91297c2393f5eccb3660483fc24d69aced708cc5dd07428435788d32ecc` |
| API-0005 | `9876ca2737c9dc3c562d326921ffc33c7d19b36fd705d1dfba95339b1496df58` |
| API-0006 | `0a164dfd2a2d3121c42d8043f12e2bdf25f1d6db695f202583bc98a8bd22adc1` |
| API-0007 | `e85a12fa2cc8b99e06550ad4c85d4424794713f964e912270c978439d2ddc687` |
| API-0009 | `02ed35c742721d8dba21b4ff505c5ec7123854a12e353d582aa6ec046b29619e` |
| API-0010 | `b857325babd1314d883391eec2750d9e17a6c6e59532010193fd82578d29c449` |

Required compatibility semantics:

- authenticate before boundary parsing;
- workspace read/write/admin checks plus organization menu, permission and data-scope checks;
- `(executionId, contextId)` start idempotency;
- immutable decision records and duplicate/late-decision recovery;
- definition draft/version/publish lifecycle;
- audit records for definition, instance, decision and retry commands;
- approval resume crosses a versioned execution command to Worker and never imports Executor into API or browser;
- notification, Feishu and Meegle behavior is behind outbound ports only.

Design decision: `extensions/biz/approval` owns the approval state machine and application vocabulary. `apps/api/src/modules/approvals` owns HTTP orchestration, authorization composition, persistence adapters and Worker command adapters. Next routes remain validation/proxy facades over pure `@sim/api-contracts`.

## 2026-07-30 checkpoint verification

This checkpoint is frozen at one coherent W8 approvals slice. It is not yet accepted in the API migration ledger and still requires independent review.

Delivered:

- all eight selected donor routes have versioned pure contracts, API handlers and original-path Next proxy facades;
- approval definitions, versions, instances, immutable decisions, audit records and effect outbox have native Drizzle persistence;
- start idempotency is enforced by `(executionId, contextId)`;
- resume crosses `API -> Worker -> configured execution service` through an execution contract;
- notification effects cross `API -> Worker durable outbox`; core approval code imports no Feishu or Meegle SDK;
- the browser consumes focused approval metadata/query surfaces and does not import Executor, Sandbox, registry, encryption or provider runtimes.

Verification:

- API validation strict gate: `1000/1000` Zod-backed routes, `0` non-Zod; W8 approvals `8/8`;
- focused contract/domain/API/Worker/proxy tests: passing;
- disposable PostgreSQL 16 + pgvector full migration and `native-approvals.postgres.test.ts`: passing; container removed after the run;
- focused TypeScript checks for contracts, Biz approval, DB, execution contracts, Worker, API and Sim: passing;
- client ratchet: `40.5 ms` on the final check, `283004` raw bytes, `68214` gzip bytes and `0` forbidden dependency-closure hits.

Known boundary:

- `project_member` data scope is deliberately fail-closed until the W8 PM membership aggregate exposes a stable port. Workspace and organization authorization paths are implemented; this checkpoint does not invent a second PM membership truth.

Next gate:

- an agent independent from the implementer must review route parity, authorization/data-scope behavior, transaction and concurrency semantics, Worker resume/effect contracts, browser closure and the real PostgreSQL fixture;
- only after review findings are resolved may the eight routes enter the accepted migration ledger.

## 2026-07-30 remediation freeze

Independent review returned `changes-required`. Work stopped at a syntactically and type-safe atomic boundary so the shared checkpoint can be committed without carrying half-built resume/schema changes.

Closed in this remediation slice:

- business capabilities now accept only global or current-workspace bindings and require both the binding and role to belong to the requested organization;
- role-based reviewer resolution now derives the workspace organization and constrains both role and binding to it;
- the Biz validator now enforces the frozen donor graph rules: one start/end, deterministic start and decision branches, no end outgoing edge, approve/reject branches, return-to-reject fallback, decision timeout safety and escalation candidates;
- list projections make `canAct` actor-specific, start/get projections remain actor-free, decisions are newest-first;
- `pending_for_me` is filtered in PostgreSQL with a correlated pending-task predicate before ordering and limit.

Still blocking re-review:

- fresh PostgreSQL hostile cross-workspace/cross-organization and more-than-200-noise fixtures;
- durable fenced resume claims for fresh/stale/failed/started/reconciled and concurrent/late retries;
- transactional durable effect/audit admission, decision/task/effect identity and concurrent outbox idempotency;
- a deployable versioned internal approval-resume receiver, readiness enforcement and a real API -> Worker -> execution-service HTTP proof;
- repository-wide strict drift and the final full type/test/PG/closure/compile rerun;
- independent reviewer acceptance.

No accepted-ledger update, staging, commit or push is authorized from this state.

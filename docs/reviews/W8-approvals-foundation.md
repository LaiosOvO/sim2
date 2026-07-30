# W8 approvals foundation independent review

Review date: 2026-07-30

Final verdict: **changes-required**

Checkpoint scope: API-0002, API-0003, API-0004, API-0005, API-0006, API-0007,
API-0009 and API-0010.

This is a foundation-checkpoint review only. The eight routes are **not** approved for the
accepted API migration ledger. The reviewer did not implement or remediate W8 and did not modify
the ledger, stage files, commit, push, or either read-only donor.

## Review basis

The formal separation spec, W8 handoff, scratch issue and the complete W8 file inventory were read.
The requested `docs/migration/sim2-polaris-upstream-alignment.md` does not exist in the target,
Sim2 donor, or Polaris donor. The normative
`docs/migration/module-alignment-matrix.md`, including its W8 Approval native-alignment section,
was read instead.

All eight frozen Polaris route files were read independently. Their current SHA-256 values exactly
match the handoff:

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

The native module is a useful deep seam: callers use one `handle` interface while authentication,
authorization, persistence, audit and Worker commands remain internal. Authentication runs before
untrusted parsing, organization owner/admin bypass is explicit, `project_member` fails closed, the
Next routes are thin facades, and the browser closure contains no DB, Executor, Sandbox, registry,
encryption, Feishu or Meegle runtime.

Those structural gains do not make the current foundation safe to commit.

## Blocking findings

### P0: workspace-scoped business roles can authorize a different workspace

`drizzle-approval-access.ts:153-165` resolves menu/permission capability from every
`business_user_role` in the organization. It never restricts a workspace binding to
`workspace_id IS NULL OR workspace_id = input.workspaceId`. A user who can read workspace B but
has `pm.approval.read` only through a role scoped to workspace A can therefore read approvals in
workspace B. The same flaw applies to `approval_logs` / `pm.approval.audit.read`.

The role join also does not require `business_role.organization_id` to equal the requested
organization, so an inconsistent cross-organization binding is trusted.

Separately, `drizzle-approval-repository.ts:149-176` resolves definition role candidates by role
code and optional workspace ID without constraining either `business_role.organization_id` or
`business_user_role.organization_id` to the approval workspace's organization. Because role codes
are unique only within an organization, users from another organization with the same code can be
created as approval reviewers.

These are tenant-isolation and authorization blockers. The current PostgreSQL fixture does not
exercise either adapter.

### P0: the native approval graph accepts definitions the frozen donor rejects

The donor state machine requires exactly one start and one end, one unconditional start edge,
no end-node outgoing edge, unique decision conditions, approve and reject edges for every approval
node, safe `isDecision` timeout behavior, and escalation candidates. It also routes `return`
through the reject edge when no explicit return edge exists.

`extensions/biz/approval/src/state-machine.ts` instead:

- accepts any positive number of end nodes (`:25`);
- does not reject end-node outgoing edges, multiple start edges, duplicate conditions, missing
  approve/reject edges, unsafe decision auto-timeouts, or escalation without candidates;
- chooses the first start edge and the first matching/default next edge (`:54-78`);
- does not implement the donor's return-to-reject fallback;
- maps every timeout action to rejection without consulting the immutable node timeout policy
  (`:100-105`).

The committed focused fixture itself contains an approval node with only an approve edge. The
native validator accepts and publishes it; the donor rejects it. This is not only missing test
coverage: it changes definition lifecycle and can record a return decision that later rolls back
because no transition can be resolved.

### P1: actor-specific task projection and `pending_for_me` semantics are wrong

The donor sets `task.canAct` only when the task is pending **and belongs to the current actor**.
`approvalView` sets it for every pending task (`drizzle-approval-repository.ts:131`). Consequently:

- list and audit responses advertise that the caller can act on another reviewer's task;
- start responses mark all initial tasks actionable, while the donor's actor-free lookup marks
  them false;
- the real page selects the first `canAct` task
  (`apps/sim/app/workspace/[workspaceId]/approvals/page.tsx:28`), so a multi-reviewer user can send
  another user's task and receive 403 even when a later task is theirs.

`pending_for_me` also differs materially. The donor filters pending actor tasks in PostgreSQL
before ordering and applying the requested limit. The native repository reads the newest 200
workspace approvals, performs N+1 hydration, then filters in memory
(`drizzle-approval-repository.ts:350-376`). A valid older pending task disappears when a workspace
has more than 200 newer approvals.

The native response also orders decisions oldest-first (`:99`), while the donor returns
newest-first. Exact actor projection, pagination and ordering need differential coverage.

### P1: resume retry and concurrency can invoke execution more than once

`claimResume` serializes one row lock but admits every non-pending instance. It treats any
`starting` row as a recovered stalled claim, does not check staleness, accepts `started`, and then
unconditionally writes `starting` (`drizzle-approval-repository.ts:750-778`).

The frozen donor admits an explicit retry only for failed, genuinely stale, durably retryable, or
reconciled terminal attempts. The native behavior allows:

- `/resume` after `started` to invoke execution again;
- two concurrent `/resume` calls to run the Worker command twice;
- a late duplicate decision during the first `starting` window to issue another command.

The API-to-Worker header happens to use `approvalId` as an idempotency key, but the Worker does not
claim or persist that key; it immediately delegates to another HTTP endpoint. Idempotency is
therefore an undocumented expectation of a downstream service, not a native invariant or tested
contract.

Production composition is also not fail-closed:

- API composition silently omits the entire approval module when Worker URL/token configuration is
  absent (`create-production-api-options.ts:75-83`), while the otherwise configured API readiness
  still reports configuration healthy (`:872-887`);
- Worker readiness checks queue and sandbox only and remains green when it installs the
  unavailable approval-resume runner;
- the production runner posts to `/api/internal/approvals/resume`, but no receiver for that path
  exists in this repository. If it is intended to be an independently deployed execution service,
  that deployment contract and a real integration are missing.

### P1: effect admission is neither transactionally durable nor concurrently idempotent

Approval state commits before the API performs the Worker effect HTTP call and audit insert. A
Worker timeout can therefore leave a committed start/decision with no durable outbox row and no
audit record. There is no server-owned retry admission; recovery depends on the client repeating a
request after the state already changed.

The Worker sink checks for an existing key and then inserts in two separate statements
(`drizzle-approval-effects-sink.ts:15-36`). Concurrent identical commands can both miss and one
fails the unique index instead of returning `already_queued`.

Decision keys are `${approvalId}:${action}:${actorId}`
(`http-worker-approval-effects.ts:55-61`). They omit task/decision identity, so two legitimate
same-action decisions by the same actor in different steps of one approval collapse into one
outbox event. The port does not carry enough identity to repair this in the sink.

Required definition, instance, decision and retry audit records have the same post-commit gap and
no idempotency key.

### P1: committed evidence does not cover the security and durability claims

The donor-parity test proves only file hashes and inventory order. The PostgreSQL test covers one
direct-user, one-step happy path, sequential start idempotency, one late duplicate and
workspace-filtered listing. It does not cover:

- access adapter workspace/organization role scope or organization-admin bypass;
- data-scope cases, including `project_member` fail-closed;
- role-candidate tenant resolution;
- any/all, return, transfer, add-sign, comment, timeout or multi-step transitions;
- concurrent starts, decisions, resume claims or effect admission;
- failed/stale/started resume retry;
- production API -> Worker -> execution-service HTTP behavior;
- outbox and audit recovery after timeouts.

These cases are necessary before the handoff's tenant, concurrency, timeout, duplicate, late,
fail-closed and durable-admission claims are supportable.

## Additional donor drift

For API-0002 and API-0003 the native module resolves the approval before parsing the body
(`create-approvals-module.ts:461-519`); the donor parses the complete request before lookup.
Malformed bodies against missing approvals therefore return 404 natively instead of the donor's
validation response.

The new strict schemas also change several donor error statuses/envelopes, such as reject/return
without comments. Strict V1 validation can be a reasonable hardening, but it needs an explicit
versioned compatibility decision and exact native/facade tests rather than being described as
unchanged donor behavior.

## Independently rerun gates

Passing:

```text
Focused non-PostgreSQL W8 suites: 27/27
Fresh pgvector/pgvector:pg16 full migration chain: passed
Fresh native approval PostgreSQL fixture: 1/1
API-contract, Biz approval, DB, execution-contract, Worker, API and Sim type-checks: passed
W8 browser closure/compile budget: 825.4 ms, 283004 raw, 68214 gzip, zero forbidden hits
W8 strict-regression source test: 1/1
```

The reviewer-created PostgreSQL container was removed after the run.

The repository-wide strict validation command is not green at this filesystem state:

```text
total routes: 1001
Zod-backed:   1000
non-Zod:      1
```

The W8 family itself remains 8/8. The extra non-Zod route is concurrent shared-worktree work in
the `internal` family, so it is not attributed to a W8 implementation finding. Nevertheless the
checkpoint cannot claim a currently passing repository-wide strict gate. The W8
`strict-regression` test only checks literals in the checker source and did not detect this actual
gate failure.

An initial root-scoped multi-workspace Vitest invocation could not resolve the per-application
`@/` aliases. Every affected suite was rerun from its owning workspace with its real configuration;
the 27/27 result above is from those valid runs.

## Minimum acceptance for re-review

1. Tenant-qualify business capability bindings and role-candidate resolution by both organization
   and current workspace; add hostile cross-workspace/cross-organization PostgreSQL fixtures.
2. Restore the frozen donor graph invariants and return/timeout behavior in the Biz state machine,
   with invalid-definition and multi-step fixtures.
3. Make `canAct` actor-specific and implement `pending_for_me` as a database-scoped query before
   limit; freeze donor ordering and multi-reviewer browser behavior.
4. Give resume one durable idempotent claim state machine with failed/stale/started/concurrent
   semantics, then prove a real API -> Worker -> configured execution-service path. Missing
   configuration must fail readiness or explicitly return unavailable, not silently omit routes.
5. Make effect and required-audit admission durable with the state transition, and make concurrent
   duplicate effect insertion return stable idempotent results. Include task/decision identity in
   real decision effects.
6. Add fresh-PG and HTTP tests for the security, state-machine, timeout, duplicate, late,
   concurrency, failure and production-composition cases listed above.
7. Rerun the focused suites, all focused type checks, fresh full migrations, strict validation and
   browser closure on the remediated frozen source.

Until those items pass independent re-review, this slice may remain uncounted foundation work but
must not be committed or described as a safe foundation checkpoint.

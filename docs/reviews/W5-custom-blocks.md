# W5 custom-blocks independent review

Result: **approved**

Initial review result: **changes-required**

Inventory:

- API-0045: `GET /api/blocks/visibility`
- API-0094: `PATCH/DELETE /api/custom-blocks/[id]`
- API-0095: `GET /api/custom-blocks/[id]/usages`
- API-0096: `GET/POST /api/custom-blocks`

Implementation: W5 custom-block implementation agent

Independent reviewer: `/root/api1037_independent_rereview`

Review date: 2026-07-30

The reviewer did not implement this batch. The Sim2 and Polaris donors were read independently;
the four route files, custom-block operations, authorization helper, and original contract are
byte-identical between those two references. This review did not change implementation, the
accepted ledger, the shared index, or Git history.

The frontend boundary work was materially correct in the initial review. The security,
wire-compatibility, projection, and enforcement findings below have now been fixed and
independently rechecked.

## Initial blocking findings

All findings in this section are resolved by the final independent re-review recorded at the end
of this document.

### 1. A mismatched custom-block/workflow association crosses the organization boundary

Priority: high

`custom_block.organization_id` and `custom_block.workflow_id` are independent foreign keys; the
database has no constraint requiring the bound workflow's workspace to belong to the same
organization.

`drizzle-custom-block-repository.ts:210-222` joins a custom block to its workflow, workspace, and
active deployment, but filters only `customBlock.organizationId`. A corrupt, stale, or crafted
org-A block bound to an org-B workflow therefore exposes org-B workflow/workspace names and
deployment input metadata in org A's list.

`drizzle-custom-block-repository.ts:228-239` has the corresponding mutation problem:
`findManageContext` returns the block's org-A feature context but authorizes against the bound
org-B source workspace. An org-B workspace admin could consequently update or delete an org-A
block by id.

The donor contains the same missing invariant, but the independent-review policy requires tenant
isolation rather than preserving a donor data leak. Qualify or validate the organization at the
repository seam. Add a real PostgreSQL fixture with an intentionally mismatched block/workflow
association and prove that it is absent from list/manage results and cannot be mutated.

### 2. Authentication, validation, unknown-field, and 500 bodies drift from the donor

Priority: high

The donor returns `{ "error": "Unauthorized" }` whenever `getSession()` yields no session.
`create-custom-block-module.ts:195` instead forwards generic authenticator messages:

- no credentials: `Credentials required`;
- invalid session: `Invalid credentials`;
- API key: `Credential type is not allowed`;
- a valid session plus an unrelated API key is treated as ambiguous instead of using the session.

The current focused test asserts only the 401 status, so it does not catch the wire or mixed-header
drift.

The donor's `parseRequest` returns
`{ "error": "Validation error", "details": [...] }` for Zod failures.
`create-custom-block-module.ts:97-99` returns only the first issue as `{ "error": "..." }`.
This affects invalid query, path, publish body, and update body responses.

The V1 publish/update schemas at `packages/api-contracts/src/custom-blocks.ts:67-88` are also
`.strict()`. The donor schemas are ordinary `z.object(...)` schemas and strip additive unknown
body fields. The native route rejects those donor-compatible requests. No versioned behavior
decision approves that change.

Finally, `create-custom-block-module.ts:396` catches unknown failures and returns
`{ "error": "Internal server error" }`; the donor `withRouteHandler` body includes `requestId`.

Restore the donor envelopes and coercion/unknown-field behavior, or record an explicit versioned
change. Add exact body assertions for missing/invalid/mixed credentials, query/path/body Zod
failures, additive request fields, invalid JSON, and unexpected repository/policy/audit failures.

### 3. Deployment input projection omits two donor trigger types

Priority: high

The donor `isInputDefinitionTrigger` accepts:

```text
starter, start, start_trigger, api_trigger, input_trigger
```

`drizzle-custom-block-repository.ts:36` accepts only:

```text
starter, start_trigger, input_trigger
```

Published workflows whose active deployment uses `start` or `api_trigger` therefore return an
empty `inputFields` projection even though the donor returns their inputs. The PostgreSQL fixture
uses only `starter`, so it cannot detect this drift.

Move the five-type rule into a focused server-safe constant/parser and add PostgreSQL cases for
all supported trigger types plus both current and legacy input-format locations.

### 4. The claimed fixed-query PostgreSQL ratchet is not asserted

Priority: medium

The repository visibly uses one joined list query and two concurrent usage queries, but
`native-custom-blocks.postgres.test.ts` never instruments the PostgreSQL client or asserts query
counts. Nevertheless, `w5-custom-block-postgres-raw.json` states:

```text
listHydrationQueries: 1
usageQueries: 2
perRowDeploymentQueriesAllowed: 0
```

Those values are documentation, not source-bound test results. Supply an instrumented Drizzle
client to the repository factory, assert one list SELECT as block count grows, and assert exactly
two usage SELECTs as live/deployed rows grow. Re-capture the PostgreSQL evidence from that final
fixture.

### 5. Method parity, production composition, and CI enforcement are incomplete

Priority: medium

The native module's automatic OPTIONS response is built from the declared GET methods plus
`OPTIONS`. For the three GET-capable routes it omits `HEAD`. Next's donor behavior includes HEAD
in the automatic Allow value. The current test freezes the incorrect
`GET, POST, OPTIONS` collection response.

Production composition exists and the API build includes the custom-block module/adapters, but
there is no test that creates production options and proves these four inventories are claimed
natively without a legacy origin. Add a production-composition route test, including an
unconfigured/fail-closed case.

The W5 performance and module-boundary commands exist in `package.json`, but
`.github/workflows/test-build.yml` does not invoke either command. Raw evidence and a local budget
are not regression gates until CI runs:

```text
bun run check:w5-custom-block-frontend-compile
bun run check:w5-custom-block-boundary
```

Wire both commands into required CI and test the OPTIONS values after adding HEAD.

## Donor and architecture review

The following behavior otherwise matches the donor:

| Concern | Review |
| --- | --- |
| Paths and primary methods | match |
| Session authentication before parsing | ordering matches; error bodies do not |
| Visibility authorization | workspace read before platform-admin/AppConfig evaluation |
| List authorization | workspace read before organization, rollout, entitlement, and hydration |
| Personal/disabled/non-enterprise list | correct empty/disabled projection |
| Publish authorization | admin -> organization -> rollout -> Enterprise -> source workflow validation |
| Manage authorization | block 404 -> rollout 403 -> source-workspace admin 403 |
| Publish constraints | deployed, exact workspace, matching organization, one block per workflow |
| Delete audit | counts usage before delete and records total/deployed values |
| Usage scope | organization-scoped, non-archived workflows, live/deployed de-duplication |
| Audit actions/metadata | publish/update/delete actions and resource metadata match |
| Enterprise policy | billing-disabled and self-host access-control bypasses match; active plan and owner block checks match |
| AppConfig policy | global/org/user/admin rules and block-visibility projection match |

The module is a useful deep seam: callers see one `handle` interface while auth, authorization,
feature/plan policy, persistence, audit, and observation remain internal. The thin Next facades
reach only the versioned proxy.

The real React Query consumer imports the focused contract. Its browser closure does not contain
`blocks/custom/build-config.ts`, Registry, Executor, Sandbox, database/auth packages, server
crypto, or provider SDKs. The focused metadata/output-name modules are the correct seam.

## Frontend evidence review

The final source hashes currently match every file listed in
`w5-custom-block-frontend-compile-raw.json`, including the measurement runner. The raw sample is:

```text
cold: 102 ms
incremental: 44 ms
```

An independent check run passed at 248 ms cold and 100 ms incremental against the fixed
5,000/1,500 ms ceilings.

The lightweight build reports:

```text
custom-blocks-query-hook: 84,572 gzip bytes, 107 inputs
custom-blocks-contract:   65,118 gzip bytes, 79 inputs
heavy-runtime leakage: none
```

Browser runtime closure passes with `api-or-worker: 0`, `infra-extensions: 0`, and no zero-budget
violations. These results validate the local frontend split, but finding 5 still blocks acceptance
because the W5-specific ratchets are absent from CI.

## Initial verification performed

Passing:

```text
W5 module/policy focused API: 13/13
full API Vitest: 246 passed, 8 skipped
fresh disposable PostgreSQL 16: 2/2; review container removed
custom-block contracts: 3/3; contract type-check passed
focused Sim facade/proxy/metadata/operations: 41/41
Sim type-check: passed
API production build: passed; 1,085 modules
W5 frontend compile ratchet: 248/100 ms, passed
W5 module/facade boundary: 7 module files, 4 facades, passed
lightweight client surfaces: passed
browser runtime closure: execution-and-sandbox 239, zero violations
strict API validation: 991/991 Zod-backed, zero non-Zod
contract purity/browser build: passed; 200-byte browser contract build
raw frontend and PostgreSQL source hashes: match current files
```

Not green:

```text
API type-check: blocked by concurrent W6 execution-control test fixture type errors
```

The API type failures are outside W5, and no W5 test failed. They do not create a new W5 code
finding, but the integration type-check must be rerun after W6 stabilizes during remediation.

## Final independent re-review

Date: 2026-07-30

Verdict: **approved**

The original reviewer did not participate in the remediation implementation. The reviewer
re-read the review, W5 handoff, corresponding scratch issue, and complete formal separation spec,
then inspected the final implementation and tests before running independent verification.

### Resolution of the eight required items

| Required item | Final finding |
| --- | --- |
| Cross-tenant composite binding | Resolved. List, hydration, manage lookup, update, and delete require the custom-block organization to equal the bound workflow workspace organization. The PostgreSQL fixture inserts a mismatched org-A block/org-B workflow and proves it is absent, immutable, and not deletable. |
| Donor auth/validation/additive/500 wire | Resolved. Missing, invalid, and API-key-only credentials return the exact donor `Unauthorized` body; a valid session remains authoritative with unrelated credentials. Zod details, strip-unknown behavior, invalid JSON, and unexpected 500 `requestId` bodies have exact tests. |
| Five trigger types and old/new projections | Resolved. `starter`, `start`, `start_trigger`, `api_trigger`, and `input_trigger` are supported at both `subBlocks.inputFormat.value` and `config.params.inputFormat`; focused and real PostgreSQL cases cover them. |
| Real PostgreSQL query counts | Resolved. A separately constructed postgres.js client records actual SQL through its debug callback. List remains one query and usage remains two SELECTs before and after adding 25 rows. |
| `Allow` and `HEAD` parity | Resolved. GET surfaces expose and implement implicit HEAD; exact OPTIONS values are asserted for all four routes. |
| Production composition | Resolved. The production composition test proves all six method/path pairs are claimed by the native module without a legacy origin and that unconfigured composition fails closed. |
| Required CI gates | Resolved. Required CI invokes W5 coverage/source hashes, module boundary, and focused frontend compile ratchets. |
| Source-bound raw SHA checker | Resolved. The coverage checker recomputes bytes and SHA-256 for every source-closure entry in both W5 raw evidence files and validates inventory, query budgets, compile budgets, package commands, and CI wiring. |

No new W5 blocker was found.

### Independent final verification

Passing:

```text
W5 module/policy/projection/production composition: 29/29
full API Vitest: 266 passed, 8 skipped
fresh disposable PostgreSQL 16: 2/2; reviewer-owned container removed
contract package: 33/33; type-check passed
focused and adjacent Sim custom-block tests: 81/81; Sim type-check passed
API type-check: passed
API production build: passed; 1,099 modules
standalone Node API: health 200, unconfigured readiness 503
W5 coverage and raw source SHA checker: passed
W5 module/facade boundary: 8 module files, 4 facades, passed
W5 frontend compile ratchet: 132/35 ms against 5,000/1,500 ms ceilings
lightweight custom-block surfaces: 84,572 and 65,119 gzip bytes, no heavy leakage
browser runtime closure: no zero-budget violations
contract purity/browser build: passed; 200-byte browser contract build
```

The repository-wide strict API-validation command was also re-run. It reported 992 Zod-backed
routes and eight concurrent non-Zod routes, all in the separately edited `approvals` family; the
W5 `custom-blocks` family remained 3/3 Zod-backed. This is a shared-worktree W8 integration drift,
not a W5 finding, and does not weaken this scoped approval.

API-0045/API-0094/API-0095/API-0096 are approved for the accepted ledger. The reviewer did not
edit that ledger.

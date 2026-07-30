# Phase 5 handoff: W5 native custom blocks

Date: 2026-07-30

Status: all first-review blockers are remediated and locally green; frozen for independent
re-review. The accepted ledger remains unchanged until a reviewer returns `approved`.

## Inventory coverage

| Inventory | Method and path | Native behavior |
|---|---|---|
| API-0045 | `GET /api/blocks/visibility` | Session, workspace read, platform-admin projection, AppConfig/fallback visibility |
| API-0094 | `PATCH/DELETE /api/custom-blocks/[id]` | Session, block lookup, feature gate, source-workspace admin, mutation and audit |
| API-0095 | `GET /api/custom-blocks/[id]/usages` | Same manage authorization, org-isolated live/deployed counts |
| API-0096 | `GET/POST /api/custom-blocks` | Workspace-scoped list/publish with feature and enterprise gates |

## Deep module and seams

`apps/api/src/modules/custom-blocks/application/create-custom-block-module.ts` is the external
module seam. Its one `handle` interface hides:

- exact route/method selection and native observation headers;
- session-only authentication before parameter/body validation;
- workspace read/admin and source-workspace manage authorization;
- feature, enterprise, and platform-admin decisions;
- contract parsing, stable donor errors, persistence, and audit ordering.

Internal seams have real production and test adapters:

- `CustomBlockRepository`: Drizzle PostgreSQL and in-memory test fake;
- `CustomBlockFeatureGate` / `BlockVisibilityReader`: AppConfig adapter and test fake;
- `CustomBlockEntitlement`: PostgreSQL subscription adapter and test fake;
- `CustomBlockAuditSink`: `@sim/audit` adapter and spy fake.

Deletion test: removing this module would redistribute auth, tenant, plan, feature, validation,
audit, and route behavior into four facades, so the module earns its depth.

## Browser and facade boundary

The React Query consumer stays at `apps/sim/hooks/queries/custom-blocks.ts`. Its local contract
adapter imports only `@sim/api-contracts/custom-blocks`; the native module and production adapters
are unreachable from the browser graph. The four Next routes import only
`apps/sim/lib/api-proxy/w5-custom-blocks.ts`.

The proxy supports `api`, `legacy`, and `off`, preserves method/body/cookie/request-id, rejects
recursive targets, applies a bounded timeout, and permits explicit legacy fallback during rollout.
Each facade is under the 1,500-byte source ceiling.

The production PostgreSQL adapter projects input fields from the active immutable deployment JSON
with a focused parser. The parser accepts `starter`, `start`, `start_trigger`, `api_trigger`, and
`input_trigger`, and reads both the current `subBlocks.inputFormat.value` and legacy
`config.params.inputFormat` locations. It deliberately does not import:

- block or tool registry;
- block config/build implementation;
- workflow serializer;
- Executor or sandbox;
- encryption or credential modules.

## Donor semantic parity

- Authentication is session-only; API keys do not broaden access.
- Missing/invalid credentials use the exact donor `{ error: "Unauthorized" }` body; a valid session
  remains authoritative when unrelated API-key or Authorization headers are also present.
- Authentication precedes malformed query/path/body validation.
- Zod failures preserve `{ error: "Validation error", details: [...] }`, request objects strip
  additive fields, invalid JSON preserves its donor body, and unexpected 500 responses include
  `requestId`.
- List performs workspace read authorization before resolving organization or feature/plan state.
- A workspace without an organization returns `{ enabled: false, customBlocks: [] }`.
- Feature-disabled list is empty; a non-enterprise organization returns `enabled: false`.
- Publish requires source workspace admin, organization ownership, feature, enterprise plan,
  deployed workflow, exact source workspace, and one block per workflow.
- Manage precedence is block `404`, feature `403`, then source-workspace admin `403`.
- Delete counts usages before deletion and records both total and deployed counts in audit metadata.
- `HEAD`, `OPTIONS` (including implicit HEAD in `Allow`), unsupported method `405`, and unrelated
  fallthrough are explicit.
- A block is readable/manageable/mutable only when its organization equals its bound workflow
  workspace organization. The same composite tenant invariant is rechecked in update/delete SQL.

## Verification evidence

- `apps/api/tests/w5/custom-block-module.test.ts`: 11/11.
- `apps/api/tests/w5/custom-block-policy.test.ts`: 5/5.
- `apps/api/tests/w5/custom-block-input-projection.test.ts`: 11/11.
- `apps/api/tests/w5/native-custom-block-production-composition.test.ts`: 2/2.
- `apps/api/tests/w5/native-custom-blocks.postgres.test.ts`: 2/2 against disposable PostgreSQL 16.
- `packages/api-contracts/tests/custom-blocks.test.ts`: 3/3.
- `apps/sim/lib/api-proxy/w5-custom-blocks.test.ts`: 3/3.
- API, Sim, and contract package type checks: pass.
- Full API suite: 266 passed, 8 skipped; no failures.
- Full contract suite: 33/33.
- Focused Sim facade/proxy/metadata/operations and adjacent runtime tests: 52/52.
- Strict API validation: pass, 992/992 recognized contract/proxy routes.
- Browser runtime closure: pass.
- Lightweight surfaces:
  - custom-block query hook: 84,572 gzip bytes / 107 inputs;
  - custom-block contract: 65,119 gzip bytes / 79 inputs.
- Source-bound Vite watch evidence:
  - captured cold: 85 ms;
  - captured incremental: 30 ms;
  - final check run: 87/44 ms;
  - ceilings: 5,000/1,500 ms.
- Custom-block module/facade boundary: 8 module files and 4 facades, zero forbidden markers.
- Production API build: pass, 1,086 modules.
- Standalone API check: health 200 and unconfigured readiness 503.
- CI now invokes W5 coverage/source-hash, module-boundary, and frontend-compile ratchets.
- `check:w5-custom-block-coverage` recomputes bytes/SHA-256 for every source-closure entry and
  validates inventory, query budgets, compile budgets, package commands, and CI wiring.

Raw compile evidence is
`docs/testing/evidence/w5-custom-block-frontend-compile-raw.json`.

## Query ratchets

- list hydration: one joined query, including active deployment state; no row-by-row deployment
  reads;
- workspace organization: one bounded query;
- usages: exactly two concurrent tenant-scoped queries (live editor and active deployment);
- publish: source validation, duplicate guard, insert, then one hydration query;
- manage: one context query before the relevant mutation/count queries.

The PostgreSQL fixture uses postgres.js debug instrumentation, not a hand-maintained counter. It
asserts one list SELECT before and after adding 25 blocks, and two usage SELECTs before and after
adding 25 live consumers. It also inserts a deliberately mismatched org-A block bound to an org-B
workflow and proves it is absent from list/manage and cannot be updated or deleted. Independent
review must reject any future change that reintroduces a per-block deployment query or weakens the
composite tenant binding.

## Reviewer checklist

The reviewer must not edit the accepted ledger. Record the verdict separately and approve only
after re-running the disposable PostgreSQL fixture, full API suite, production build/type checks,
strict validation, browser closure, lightweight surfaces, boundary check, and compile ratchet.

## Re-review readiness

All eight required re-review items from `docs/reviews/W5-custom-blocks.md` are implemented. The
final shared-worktree API suite, API/Sim/contracts type checks, production build, focused Sim
tests, fresh PostgreSQL 16 fixture, strict validation, lightweight surfaces, browser closure,
standalone API, W5 boundary, W5 compile, and evidence-hash checker are green. The original review
artifact intentionally remains `changes-required` until an independent agent re-runs the evidence
and records a new verdict.

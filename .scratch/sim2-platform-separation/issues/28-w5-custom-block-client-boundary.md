# W5 custom-block client boundary

Date: 2026-07-30

Status: native implementation and local verification complete; independent review is still required,
so API-0045/API-0094/API-0095/API-0096 are not yet accepted.

## Finding

The real custom-block React Query consumer imports
`apps/sim/lib/api/contracts/custom-blocks.ts`. That contract previously imported
`apps/sim/blocks/custom/build-config.ts` only to validate three reserved output names. The
build-config module also owns editor block synthesis and execution-tool wiring, so a tiny metadata
validation concern crossed the browser/server/runtime boundary and made the contract closure reach
the block implementation.

## Refactoring seam

Reserved output-name policy now lives in the browser-safe
`apps/sim/lib/custom-blocks/output-names.ts` deep module. Identity/presentation metadata lives in
the adjacent `metadata.ts` seam. Contracts, editor UI, persistence, serialization, Copilot, and
execution call sites use those focused interfaces. The heavier build-config module re-exports the
legacy names so existing runtime callers remain compatible while they migrate.

Two non-regression surfaces were added:

- custom-block query hook: 90,529 gzip bytes / 119 inputs, ceiling 92,000;
- custom-block contract: 71,057 gzip bytes / 91 inputs, ceiling 72,000.

Both surfaces explicitly forbid `apps/sim/blocks/custom/build-config.ts`. Focused metadata,
output-name, build-config, and operations tests pass 25/25.

## Remaining route work

The route work now exists behind the `CustomBlockModule.handle` interface:

- versioned schemas and four-route inventory at `@sim/api-contracts/custom-blocks`;
- session-only authentication before validation and workspace read/admin authorization;
- source-workspace manage authorization with donor not-found → feature → admin precedence;
- production PostgreSQL, AppConfig feature/visibility, enterprise-plan, platform-admin, and audit
  adapters;
- four thin Next facades with native/off/legacy rollout and bounded legacy fallback;
- the existing `useCustomBlocks` React Query consumer now reaches the versioned package schema
  through the local route-contract adapter;
- real PostgreSQL 16 fixture: 2/2 passed, covering active deployment input projection,
  cross-organization usage isolation, live/deployed de-duplication, publish/update/delete;
- focused behavior/policy tests: 13/13; package contracts: 3/3; proxy: 3/3;
- source-bound Vite sample: cold 102 ms, incremental 44 ms; check sample 105/59 ms;
- browser surface: hook 84,572 gzip / 107 inputs, contract 65,118 gzip / 79 inputs;
- browser runtime closure and strict API-validation gates pass after recognizing the W5
  versioned-proxy facade.

The module owns the complexity instead of layering a second legacy operations wrapper. Its
PostgreSQL adapter derives Start inputs directly from the active immutable deployment snapshot and
never imports the registry, serializer, Executor, sandbox, or server crypto.

## Independent-review hold

Do not mark any W5 route accepted until a separate agent:

1. re-runs the disposable PostgreSQL fixture;
2. compares method/auth/error/audit ordering against the donor routes;
3. verifies facade rollback behavior and production composition;
4. re-runs type checks, full API tests, strict validation, browser closure, lightweight surfaces,
   and the source-bound compile ratchet;
5. records an `approved` review artifact.

Final shared-worktree API suite attempt had two failures, both in concurrently edited W6 Group B
(auth-before-parse and a stale import-boundary string expectation). W5 focused tests, type-check,
and production build pass; the reviewer must re-run the full suite after W6 settles.

## Independent-review remediation (2026-07-30)

The first review found four structural gaps in the native seam. The following changes are now
implemented and locally verified:

- repository list/manage/update/delete/load operations enforce the composite invariant
  `custom_block.organization_id = workspace.organization_id`; a deliberately malformed block bound
  to another tenant is absent from list/manage and cannot be updated or deleted;
- deployment input projection is a small server-safe module supporting donor trigger types
  `starter`, `start`, `start_trigger`, `api_trigger`, and `input_trigger`, reading both current
  `subBlocks.inputFormat.value` and legacy `config.params.inputFormat`;
- request objects use Zod's strip-unknown behavior; authentication and validation/error envelopes
  now match the donor, including mixed valid-session/unrelated-credential handling and request IDs
  on unexpected 500 responses;
- exact Next-compatible `Allow` values include implicit `HEAD` on GET surfaces.

Verification captured during remediation:

- W5 HTTP/policy/projection tests: 27/27 passed;
- W5 API contract tests: 3/3 passed;
- disposable PostgreSQL 16 test: 2/2 passed in 1.19 s;
- real postgres.js debug instrumentation observes one SQL query for list hydration and exactly two
  SQL queries for usage counts, unchanged after growing each fixture by 25 rows;
- full API type-check was clean after the W5 signature fixes; a later shared-worktree run reports
  only the concurrently edited W8 approvals module at `create-approvals-module.ts:392`.

Production composition, CI evidence-hash enforcement, and the final full shared-worktree regression
remain before asking the original reviewer for a second decision.

### Remediation closure

Those remaining gates are now green:

- production composition 2/2, including all four inventories without a legacy origin and
  unconfigured fail-closed behavior;
- full API suite 266 passed / 8 skipped, API type-check and 1,086-module production build passed;
- contract package 33/33 plus type-check; focused and adjacent Sim W5 tests 52/52 plus Sim
  type-check;
- strict API validation 992/992, browser runtime closure, lightweight surfaces, standalone API,
  custom-block boundary, and focused Vite compile all passed;
- refreshed compile sample is 85 ms cold / 30 ms incremental; final check is 87/44 ms;
- CI runs coverage/source-hash, module-boundary, and frontend-compile ratchets;
- the coverage checker recomputes bytes and SHA-256 for every raw source-closure entry and passes.

Implementation is frozen for independent re-review. The accepted ledger and the existing
`changes-required` review artifact remain untouched.

# W6 execution-read second-review remediation

Date: 2026-07-30

Status: independent re-review approved the functional routes on 2026-07-30. API-0282, API-0996,
and API-0997 are now in the accepted ledger. The Next.js whole-page cold-start milestone remains
open.

## Fixed after the second independent review

1. The Resume client now narrows dynamic JSON through a local `jsonObject()` projection before
   reading response data or submitted resume values. It no longer reaches through the strict JSON
   union and does not restore the old monolithic workflow contract.
2. `registeredAt` is normalized to the existing nullable date interface.
3. `DrizzleWorkflowReadScopeReader` now requires `workflow.archivedAt IS NULL`. Archived workspace
   and personal workflows therefore resolve to donor-compatible 404 before API-key scope or
   personal-workflow checks can expose their existence.
4. The execution-read module matrix now covers session users, workspace and personal API keys,
   internal users, internal service actors, authenticated invalid encoded parameters, wrong
   methods, and unrelated-path fall-through.
5. A disposable PostgreSQL 16 fixture covers active, archived workspace, and archived personal
   scope reads plus the resulting authorization precedence.

## Verification

```text
node ../../node_modules/vitest/vitest.mjs run tests/w6
  4 files passed, 1 skipped
  34 tests passed, PostgreSQL tests skipped by the safety guard

SIM_REQUIRE_POSTGRES_TEST=1
SIM_TEST_DATABASE_DISPOSABLE=1
DATABASE_URL=<one-time postgres:16-alpine database>
node ../../node_modules/vitest/vitest.mjs run tests/w6/native-execution-read.postgres.test.ts
  1 file passed
  2 tests passed

node --max-old-space-size=8192 node_modules/typescript/bin/tsc \
  --noEmit -p apps/sim/tsconfig.json --pretty false
  W6 Resume errors: 0
  passed after repairing the incomplete local @daytona/sdk installation
```

The initial full Sim type check exposed that the installed `node_modules/@daytona/sdk` directory
contained only `package.json` and `README.md`; its declared `esm` and `cjs` exports were absent.
This was an incomplete local installation, not a Bun-runtime compatibility result. A forced
workspace reinstall was stopped after it had restored those directories but stalled during the
monorepo linking phase. After verifying both entry files existed, the same full Sim type check
passed with zero errors.

This does not change ADR-0004: Bun remains the package manager/script runner, while API, Worker,
Feishu ingress, and local Sandbox production roles remain Node.js processes. Daytona is a remote
Sandbox adapter; local `isolated-vm` still has the decisive Node native-ABI constraint.

The API-wide type check was also started while a provider-model discovery slice was being edited.
Its owning agent fixed its exact-path union and will provide the final full check with that slice.

## Source-bound performance gate

The final Resume client entrypoint is now covered by a focused Vite watch ratchet that performs a
real append-and-restore edit on the entrypoint, records the original/edited/restored SHA-256 values,
and binds the measurement to the browser view-model, execution-read hook/contract, focused EMNC
surface, and direct Lucide icon wrapper.

```text
bun run measure:w6-resume-frontend-compile
  cold compile: 416 ms
  incremental compile after real source edit: 149 ms
  source restored to the exact original SHA-256

bun run check:w6-resume-frontend-compile
  cold compile: 385 ms / 5,000 ms ceiling
  incremental compile: 131 ms / 1,500 ms ceiling

bun run check:lightweight-client-surfaces
  resume-execution-page-client: 202,347 gzip bytes, 311 inputs
  no heavy runtime leakage
  lucide-react root barrel is forbidden for this surface

bun run check:browser-runtime-closure
  execution-and-sandbox client roots: 239
  zero-budget violations: 0
```

The raw record is
`docs/testing/evidence/w6-resume-frontend-compile-raw.json`; the budget is
`docs/testing/w6-resume-frontend-compile-budget.json`. Both the W6 ratchet and the existing
API-1009 ratchet pass, and the W6 check is wired into `.github/workflows/test-build.yml`.

## Next.js journey milestone kept separate and visible

The existing real journey remains:

- Resume page first valid request: 19.769 s total / 19.714 s TTFB.
- Warm requests: 0.167 s and 0.134 s.
- Two cold compile traces: 17,808.8 ms and 17,057.0 ms.
- API-0282 facade compile: 230.6 ms.

The cold Resume page is still above the 10-second Next.js journey goal. The review policy separates
functional route approval from that frontend-performance milestone and does not permit an overall
speed-complete claim. The source-bound focused compile evidence is now complete; the slower
end-to-end Next.js cold journey remains an explicit later milestone rather than being hidden.

A real code-edit probe without an HMR-connected browser returned 200 in 0.794 s with 0.752 s TTFB,
but Turbopack did not emit a route `compile-path` event for that request. A later browser-connected
probe printed `Compiled in 1055ms`, but the browser then encountered the incomplete Daytona install
described above. That probe is intentionally invalidated and is not recorded as a successful
incremental result. After the install repair, browser reload was blocked by the browser URL safety
policy, so no workaround or alternate browser surface was used. That browser probe remains
invalidated. It has now been replaced by the reproducible source-bound Vite watch measurement above
rather than by a misleading browser number.

## Independent re-review exit

The final independent reviewer verified the JSON projection, active-workflow filter, PostgreSQL
fixture, full identity/method/error matrix, source-bound raw performance evidence, budget, and CI
ratchet. The three inventory IDs are approved for functional-route acceptance; this does not
approve the overall frontend-performance milestone.

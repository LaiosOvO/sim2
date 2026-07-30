# Frontend experience speedup ratchet — round 1

## Outcome

This round establishes executable browser-boundary and bundle-size ratchets, then applies them to
two real frontend paths:

- password generation no longer imports the server encryption/key module;
- Secrets Manager no longer reaches Executor through validation helpers, API contract barrels, or
  the `credential-detail` barrel;
- API-1037 workspace-fork UI imports focused resource/create contracts and hooks instead of the
  former monolithic contract/hook pair.

The change attacks the dependency-graph cause of repeated compilation. It is independent of whether
the eventual frontend build is Webpack, Turbopack, or Vite. Switching bundlers without these seams
would still leave the browser compiler traversing the same mixed registry/server graph.

Raw machine-readable evidence is in
`docs/testing/evidence/frontend-experience-round-1.json`.

## Boundary design

The new seam is intentionally small:

```text
client component
  -> browser helper / focused hook
    -> versioned data contract
      -> HTTP request

server encryption, Executor, Sandbox, registry implementation, DB/Auth and Infra
  -X-> browser closure
```

`apps/sim/lib/browser/password.ts` owns only browser-safe password generation.
`apps/sim/lib/browser/environment-variable.ts` owns only portable variable-name validation.
Neither needs to know that server encryption or Executor exists. Workspace-fork resource and create
operations likewise expose separate contracts/hooks instead of a large feature registry.

These are deep-module seams: the client receives a narrow capability and a data-only contract while
the implementation-heavy subsystems remain hidden behind the server boundary.

## Before and after

### Generated password component

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Raw JavaScript | 384,588 B | 78,144 B | -79.7% |
| Gzip JavaScript | 97,915 B | 24,834 B | -74.6% |
| Server markers | `ENCRYPTION_KEY`, `Encryption` | none | removed |
| Strict JS+CSS gzip ratchet | not present | 25,953 B / 32,768 B | enforced |
| Build inputs | not recorded | 34 | enforced |

The previous component imported `generatePassword` from
`apps/sim/lib/core/security/encryption.ts`. Asking for one browser utility therefore loaded the
server configuration/key boundary. The component now imports
`apps/sim/lib/browser/password.ts`.

### Browser runtime closure

The count is the number of client roots that can reach each heavy category. It is not the number of
client entry files in the repository.

| Heavy category | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Executor | 297 | 271 | -26 |
| Execution/Sandbox | 267 | 240 | -27 |
| Runtime tools/blocks/triggers | 200 | 198 | -2 |
| DB/Auth/secrets | 71 | 71 | 0 |
| Server crypto/provider SDK | 233 | 191 | -42 |
| Infra extensions | 0 | 0 | 0 |
| API/Worker | 0 | 0 | 0 |

Total client roots remain 588. This round reduces polluted roots; it does not remove application
screens.

Two migrated roots now have permanent zero budgets:

- `generated-password-input.tsx` may not reach server crypto/provider SDK;
- `secrets-manager.tsx` may not reach Executor.

The closure checker records an exact pollution chain when either protected root regresses.

### API-1037 workspace-fork UI

Before the focused split, the modal's selected feature surface depended on 35,173 bytes of
monolithic contract source plus 11,003 bytes of monolithic hook source: 46,176 source bytes in
total. The five focused contract/hook/query-key files total 5,880 source bytes, an 87.3% reduction
in the directly selected source surface.

Source bytes and bundled gzip bytes are deliberately reported separately; they are not treated as
the same unit.

| Browser entry | Gzip | Inputs | Ratchet |
| --- | ---: | ---: | ---: |
| Fork workspace modal | 201,819 B | 383 | 212,000 B |
| Resource query hook | 82,609 B | 105 | 87,000 B |
| Create mutation hook | 88,070 B | 118 | 93,000 B |

All three builds have zero forbidden inputs and zero forbidden output markers. Their budgets are
close non-regression ceilings, not aspirational targets. Later rounds should lower them by cutting
remaining UI/design-system and shared-query closure.

## Dependency chains cut

The work followed the graph until the protected roots reached zero:

1. `generated-password-input -> core/security/encryption -> server env/key`;
2. `secrets-manager -> executor/constants` for a regular expression;
3. credentials, workspace, and environment query modules through
   `lib/api/contracts/index -> storage-transfer -> executor`;
4. `secrets-manager -> credential-detail/index -> add-people-modal -> permissions ->
   socket-provider -> workflow store -> executor`.

The fixes are browser helpers and direct leaf imports, not allow-list exceptions.

## Executable gates

Run from `D:\workspace\workflow\sim2-refactor`:

```powershell
bun scripts/architecture/build-isolation/check-lightweight-client-surfaces.ts
bun scripts/architecture/dependency-graph/check-browser-runtime-closure.ts --check
bunx vitest run scripts/architecture/bundle-budget/compile-trace-metrics.test.ts
node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit -p apps/sim/tsconfig.json
```

Run focused application tests from `apps/sim` so its `@` alias configuration is used:

```powershell
bunx vitest run lib/browser/password.test.ts lib/browser/environment-variable.test.ts lib/core/security/encryption.test.ts
bunx vitest run lib/api/contracts/workspace-fork-resources.test.ts ee/workspace-forking/hooks/fork-resource-client-boundary.test.ts
```

Observed results:

- lightweight surfaces: 6/6 passed;
- browser closure: passed, zero protected-root violations;
- browser/security tests: 3 files and 29 tests passed;
- API-1037 focused contract/client-boundary tests: 2 files and 4 tests passed;
- trace-metric tests: 1 file and 2 tests passed;
- full Sim TypeScript check: passed with an 8 GB Node heap.

## First and incremental compile evidence

`compile-trace-metrics.ts` and `collect-next-baseline.ts` now classify the first observed
`compile-path` event per route trigger separately from later events for the same trigger. Both
groups expose count, total, maximum, and p95 duration, and focused tests prove the classification.

This is collection capability, not yet a latency win claim. A trustworthy latency comparison still
requires the same runner and workload:

1. remove or isolate the controlled Next development cache;
2. start the development server and open representative routes once;
3. edit/reload the same routes for incremental samples;
4. collect `.next/dev/trace` with `collect-next-baseline.ts`;
5. compare first-observed and incremental distributions against the agreed 10 s / 1 s targets.

This round therefore proves bundle/import-graph improvement. It does not yet prove whole-page cold
startup or hot-update elapsed time, and it is not a Vite migration.

## Independent review and integration

Status: **changes-required; fixes implemented and pending re-review**.

Acceptance follows `docs/testing/migration-independent-review-policy.md`. A reviewer other than
the implementation agent must rerun the commands above, inspect the direct-import seams, and verify
the evidence JSON. The review result must be recorded as `approved`, `changes-required`, or
`blocked`.

The root integration owner should expose
`check-lightweight-client-surfaces.ts` as a package/CI command next to the browser-closure gate.
Hard compile-time thresholds should only be enabled on a stable controlled runner; the structural
and gzip ratchets are deterministic enough to gate immediately.

### Review remediation

The first independent review found four blockers. The implementation now addresses them:

1. Next trace durations use the same `1000 units = 1 ms` conversion in aggregate, longest-path and
   first/incremental metrics. The collector resets cold classification on every
   `start-dev-server`; focused tests cover scale, aggregate consistency and multi-session traces.
2. `bun run check:lightweight-client-surfaces` is in the root package and
   `.github/workflows/test-build.yml`. A committed impossible 1-byte fixture proves the CLI exits
   non-zero on regression.
3. API-1037 focused hook tests now mount real React Query hooks in jsdom and cover query identity,
   abort signal forwarding, disabled state, active-workspace cache insert/deduplication, list/admin
   invalidation and lineage/background-work settlement on success and rejection. The focused set is
   3 files / 8 tests.
4. A source checkpoint will be committed before regenerating the final evidence JSON; the evidence
   will name the measured commit and hash its checker/baseline/entry inputs. No uncommitted source
   state may be represented only by the previous HEAD again.

The lightweight gate now also ratchets the W6 resume hook and focused contract. The hook is 84,639
gzip bytes / 107 inputs and the contract is 64,927 gzip bytes / 79 inputs, with zero reachability to
Executor, the old workflow contract, workflow middleware or server-only runtime markers.

## Remaining work

- 271 client roots can still reach Executor, 240 can reach Execution/Sandbox, and 191 can reach
  server crypto/provider SDKs. These are future cut lists, not accepted architecture.
- DB/Auth/secrets remains at 71 roots and needs its own leaf-contract campaign.
- The workspace-fork modal is still a 201,819-byte gzip isolated build and needs a second
  component/query/design-system closure round.
- A controlled browser journey is still required for defensible first-open and incremental timing.
- Vite evaluation belongs after the client/server dependency seams are enforced, so bundler
  migration is measured against a stable architecture rather than used as a substitute for it.

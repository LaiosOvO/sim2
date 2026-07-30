# Frontend experience speedup round 1 independent review

Result: **changes-required**

Implementation: frontend-performance round 1 implementation agent  
Independent reviewer: `/root/api1037_donor_audit`  
Review date: 2026-07-30

The reviewer did not implement this frontend-performance round. This review follows
`docs/testing/migration-independent-review-policy.md` and covers:

- `docs/handoffs/frontend-experience-speedup-ratchet-round-1.md`;
- `docs/testing/evidence/frontend-experience-round-1.json`;
- the lightweight isolated-build ratchet;
- the browser runtime-closure ratchet;
- the password/environment browser seams;
- the API-1037 focused resource/create contracts, hooks and modal imports;
- compile trace collection and its focused tests.

The bundle and dependency-closure improvement is real, but the round cannot be approved until the
blocking measurement and enforcement findings below are fixed.

## Blocking findings

### 1. Compile phase durations are reported at ten times the collector's existing unit

Priority: high

`scripts/architecture/bundle-budget/compile-trace-metrics.ts:37` defaults
`durationUnitsPerMillisecond` to `100`, and line 46 divides each trace duration by that value.
However `scripts/architecture/bundle-budget/collect-next-baseline.ts:85-86` converts the same
`compile-path.duration` field with:

```text
Math.round(duration / 100) / 10
```

which is equivalent to `duration / 1000` milliseconds.

The discrepancy reproduces directly for a single event with `duration: 1000`:

```json
{
  "legacyCollectorTotalMs": 1,
  "newPhaseTotalMs": 10
}
```

The focused test currently expects `1000 -> 10 ms`, so it freezes the incorrect conversion instead
of detecting it. A collected baseline would contain mutually inconsistent values:
`compilePathTotalMs` at one scale and `compilePhases.first/incremental` at another.

Change the default to the actual Next trace unit, make the legacy aggregate call the same shared
conversion, and add a consistency assertion that:

```text
compilePhases.first.totalMs + compilePhases.incremental.totalMs
  == compilePathTotalMs
```

within the documented rounding tolerance.

### 2. The new lightweight bundle ratchet is not connected to a package or CI gate

Priority: high

`check-lightweight-client-surfaces.ts` is executable and failed builds would return non-zero, but
there is no `check:lightweight-client-surfaces` command in `package.json` and no invocation in
`.github/workflows/test-build.yml`.

By contrast, the browser runtime-closure ratchet is wired through
`package.json:33` and `.github/workflows/test-build.yml:216-217`. The handoff itself lists the
lightweight integration as remaining work at line 173.

This means the bundle budgets are currently an optional measurement, not a permanent ratchet that
fails the integration build on regression. Add the package command and CI step, then demonstrate a
negative fixture or controlled temporary budget violation returns non-zero.

### 3. API-1037 focused tests do not exercise either focused hook's behavior

Priority: medium

The reported API-1037 “2 files / 4 tests” consists of:

- two contract parsing tests;
- one source-text import assertion;
- one source-byte assertion.

There is no test through the focused hook interfaces:

- `useForkResources` has no test for query key, `enabled`, stale time, request params, or forwarding
  the React Query abort signal;
- `useForkWorkspace` has no test for the active-workspace cache insert/deduplication, list/admin-list
  invalidation, lineage invalidation, or background-work invalidation on success/error settlement;
- the modal has no focused render/integration test proving it calls the split hooks with the same
  source workspace and open-state semantics.

The code was copied nearly verbatim and no behavior regression was found by inspection, but source
search is not a substitute for testing the Module through its Interface. Add focused hook tests
around `requestJson` and `QueryClient`; at minimum cover the cache-miss, dedupe and rejected-mutation
paths.

### 4. The evidence file is not bound to an immutable source state

Priority: medium

`frontend-experience-round-1.json` records only committed HEAD `154c170c1`, while all round-1 files
are uncommitted in a shared dirty worktree. It does not record a working-tree diff hash, file
content hashes, Bun version, or the exact metafile inputs.

This caused immediate drift during review:

| Surface | Evidence | Reviewer rerun |
| --- | ---: | ---: |
| workspace-fork modal gzip | 201,819 B | 200,043 B |
| modal inputs | 383 | 382 |
| create hook gzip | 88,070 B | 86,242 B |
| create hook inputs | 118 | 116 |

The later change was an independent `background-work.ts` migration at 08:59, after evidence capture
at 08:53. It does not invalidate the optimization, but it proves the evidence cannot identify the
source state it measured.

Record either a commit SHA that contains the measured source or an archive/diff SHA plus hashes for
the baseline, checker and entry files. Preserve the Bun metafile or at least its normalized input
list under `docs/testing/evidence/`.

The same concurrent change currently makes the handoff's full Sim type-check command fail in
`hooks/background-work.ts` because the new contract requires a `body` property. This failure is
outside round 1, but the current dirty tree can no longer reproduce the handoff's “type-check
passed” claim.

## Verified improvements

### Generated password seam

The before and after values are independently reproducible.

At committed HEAD `154c170c1`:

```text
raw JavaScript: 384,588 bytes
gzip JavaScript: 97,915 bytes
inputs: 121
markers: ENCRYPTION_KEY, Encryption
```

At the reviewed round-1 source:

```text
raw JavaScript: 78,144 bytes
gzip JavaScript: 24,834 bytes
total JS+CSS gzip: 25,953 bytes
inputs: 34
markers: none
```

The browser now imports a small password Module whose Interface is only
`generatePassword(length?)`; the server encryption implementation and key configuration disappear
from the closure. Password behavior remains cryptographically backed by
`crypto.getRandomValues()` through `@sim/utils/random`.

### Secrets Manager seam

The two dependency cuts are real:

- environment-variable validation moved from `executor/constants.ts` to the pure browser helper;
- `UnsavedChangesModal` is imported from its leaf file instead of the `credential-detail` barrel.

The protected Secrets Manager root no longer reaches Executor. Query modules also moved from the
monolithic contract barrel to focused contract/type leaves.

### API-1037 focused surface

The source-byte comparison exactly reproduces:

```text
before workspace-fork contract: 35,173 bytes
before workspace-fork hook:     11,003 bytes
before total:                   46,176 bytes

after five focused files:        5,880 bytes
reduction:                         87.3%
```

An independent modal build contains:

```text
workspace-fork-create.ts
workspace-fork-resources.ts
use-fork-workspace.ts
use-fork-resources.ts
fork-query-keys.ts
packages/api-contracts/src/workspace-forking.ts
```

and does not contain the monolithic `workspace-fork.ts`, monolithic `workspace-fork.ts` hook,
Executor, Registry, Sandbox or encryption implementation.

The create route continues to import the compatibility re-export from the old contract file, so
the client split does not change the server route implementation. Params, body bounds, response
shape and React Query cache behavior match the prior source by inspection. The resource response
schema strips undeclared persistence fields such as storage keys and MCP secrets.

This review does not approve the separate API-1037 backend migration: its existing independent
review still requires a cross-workspace folder predicate and typed error parity. Round 1 neither
introduces nor fixes those backend findings.

### Runtime closure

The current checker reproduces:

```text
client roots: 588
Executor: 271
Execution/Sandbox: 240
Runtime tools/blocks/triggers: 198
DB/Auth/secrets: 71
Server crypto/provider SDK: 191
Infra: 0
API/Worker: 0
protected-root violations: 0
```

The per-category ceilings are exact non-regression limits and the two migrated roots have permanent
zero budgets. The checker now prints the exact pollution chain for a protected-root regression.

## Budget review

- modal and focused-hook budgets have approximately 5-8% headroom and are suitable
  non-regression ceilings;
- generated-password has 6,815 bytes / 26% headroom, but the absolute budget is still only 32 KiB
  and the zero forbidden-input/marker checks prevent restoration of the old server graph;
- helper budgets are loose in percentage terms but only 664 bytes of combined absolute headroom.

The budgets are not the reason for rejection. The missing CI invocation is.

## Verification performed

Passing:

```text
lightweight isolated builds:
  6/6 surfaces passed
  password total gzip 25,953 bytes
  modal total gzip 200,043 bytes
  resource hook gzip 82,609 bytes
  create hook gzip 86,242 bytes

browser runtime closure:
  588 roots, exact category ceilings, zero protected-root violations

browser/security tests:
  3 files, 29 tests passed

API-1037 focused tests:
  2 files, 4 tests passed

compile trace tests:
  1 file, 2 tests passed, but they assert the wrong duration scale
```

Not reproducible from the current shared tree:

```text
full Sim type-check:
  failed in apps/sim/ee/workspace-forking/hooks/background-work.ts
  concurrent post-evidence change; not attributed to round 1
```

No controlled browser journey exists, so this review agrees with the handoff's limited claim:
round 1 proves import-graph and isolated-bundle improvement, not cold page-open or incremental
compile latency.

## Re-review requirements

1. Correct the trace duration conversion and add aggregate/phase consistency tests.
2. Wire the lightweight isolated-build ratchet into `package.json` and CI.
3. Add behavior tests for both focused API-1037 hooks, including error settlement.
4. Regenerate evidence against an immutable source state and include normalized build inputs.
5. Re-run full Sim type-check from a clean integration state.
6. Request a new independent review; do not describe round 1 as approved before these pass.

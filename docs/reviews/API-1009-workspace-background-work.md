# API-1009 workspace background-work independent re-review

Result: **approved**

Approval scope: **functional route approval only**

Route: `GET /api/workspaces/[id]/background-work`

Implementation agent: `/root/api1032_donor_audit`

Remediation agent: `/root/api1037_donor_audit/w6_group_a_independent_review`

Independent re-reviewer: `/root/api1009_independent_rereview`

Review date: 2026-07-30

The re-reviewer did not implement API-1009 and did not modify the accepted-route ledger or Git
index. This decision follows `docs/testing/migration-independent-review-policy.md`.

API-1009 is eligible to enter the accepted API-route ledger. This approval does **not** approve the
overall frontend-performance milestone: the recorded whole-page Next cold path is still over the
10-second target and did not reach a successful page open, incremental Next compile, or key
interaction.

## Re-review decision

All three findings from the first independent review are closed:

1. repeated `cursor` and `limit` values now preserve donor-compatible Zod rejection and
   authentication precedence;
2. the real PostgreSQL adapter is tested across identical timestamps, sub-millisecond cursor
   precision, and a fixed two-query ratchet;
3. source-bound cold and incremental Vite measurements, raw evidence, a fixed budget, and CI
   enforcement are present and synchronized with the reviewed source.

No new functional, tenant-isolation, secret-leakage, query-growth, or focused frontend-closure
defect was found.

## Donor compatibility

The re-review read the route, validation helper, authorization logic, background-work store, wire
contract, and browser hook directly from:

- `D:\workspace\workflow\sim2`;
- `D:\polaris`.

The relevant donor files remain equivalent between Sim2 and Polaris. The native behavior matches:

| Concern | Donor behavior | Native behavior | Decision |
| --- | --- | --- | --- |
| Method/path | GET on the exact workspace path | GET facade and GET-only tenant-read module | match |
| Authentication | session user first | session-user policy first | match |
| Validation order | auth, then params/query | auth, then params/query | match |
| Repeated scalar query | array reaches Zod and returns 400 | complete array reaches V1 Zod and returns 400 | match |
| Workspace/authz order | active workspace, feature gate, admin | same | match |
| Tenant involvement | direct, child metadata, other metadata, live-child sync/rollback | same four-way predicate | match |
| Archived children | excluded | excluded | match |
| Status scope | five surfaced statuses | same allowlist | match |
| Pagination | `updatedAt DESC, id DESC`, `limit + 1` | same | match |
| Invalid cursor | ignored, first-page semantics | same | match |
| Success wire | `{items,nextCursor}` with ISO timestamps | same V1 response | match |
| Errors | donor-compatible 400/401/403/404/500 order and shape | same | match |
| Browser consumer | formerly reached the 816-line workspace-fork contract | focused subpath only | improved |

Two intentional deviations remain approved:

- metadata is parsed by an allowlist before serialization, preventing unknown secret-bearing JSONB
  fields from crossing the wire;
- the opaque native cursor serializes `id` before `updatedAt`. Both implementations decode by
  property name, so donor cursors, native cursors, and rollback remain compatible.

## Closure of the previous findings

### Repeated `cursor` and `limit`

`scalarQueryValue()` uses `URLSearchParams.getAll()`. A single occurrence stays a string; multiple
occurrences remain an array and are rejected by `workspaceBackgroundWorkQueryV1Schema`.

Independent focused tests prove:

- authenticated repeated `cursor` returns 400;
- authenticated repeated `limit` returns 400;
- the response uses the donor `Validation error` shape with Zod `invalid_type` details;
- current-access and persistence ports are not called on either validation branch;
- the same malformed query without a session returns 401 before validation or persistence.

The V1 contract test independently freezes array rejection.

### PostgreSQL cursor precision and query count

The re-review ran the adapter against a dedicated disposable `postgres:16-alpine` container with
`SIM_TEST_DATABASE_DISPOSABLE=1` and `SIM_REQUIRE_POSTGRES_TEST=1`. The container was removed after
the test.

The passing fixture proves:

- rows sharing `2026-07-30 10:00:00.123456` paginate by `id DESC`;
- a cursor carrying six-digit microsecond precision crosses from
  `2026-07-30 10:00:00.123456` to `2026-07-30 10:00:00.123455`;
- the two values collapse to the same JavaScript millisecond, so the test genuinely exercises the
  database precision seam;
- invalid cursor, tenant isolation, involvement filters, archived-child exclusion, and metadata
  stripping remain intact;
- the Drizzle logger observes exactly one child-workspace query and one background-work query for
  both the small fixture and the fixture after inserting 250 relevant rows.

This is a real two-adapter seam: production uses the Drizzle/PostgreSQL adapter, while focused
tests use injected in-memory readers. The application module keeps authorization, validation, and
response behavior behind one small `execute()` interface.

### Frontend compile and dependency closure

The real Activity-feed hook imports:

```text
apps/sim/lib/api/contracts/workspace-background-work.ts
  -> @sim/api-contracts/workspace-background-work
```

It no longer imports the workspace-fork monolith or a package root barrel. The focused closure is
2,898 gzip bytes and contains no DB/Drizzle, Registry, Executor, Sandbox, Next server, Node crypto,
API runtime, or Worker runtime.

The raw evidence at
`docs/testing/evidence/api-1009-frontend-compile-raw.json` is synchronized with the final source:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| hook | 2,543 | `c2dca5ab8eb286bf19d02312dbb07a7dbee5f1a12d578474bee0001974201c5a` |
| Sim focused wrapper | 735 | `8092d050ef0df65d3994d995aecbc8fd30bb03b5909c505c0cf0aa7657ae0537` |
| versioned package contract | 3,873 | `daccbf18dba7786cbc1a20198f480a036e2865c5ece6d1813f75a8a367d60af9` |
| measurement runner | 11,978 | `00cbbadcc1d8b7d35ba2a7df1f2108723fa2361136358dabef38ff2a91c3823e` |

The committed raw sample is 78 ms cold and 29 ms incremental. The independent check sample was
118 ms cold and 46 ms incremental. Both are below the fixed 2,000/750 ms budgets. The runner:

- starts a fresh Vite watch build from the real hook;
- appends a valid probe to the tracked entrypoint;
- waits for the next watch bundle;
- restores the exact source;
- verifies original, edited, and restored SHA-256 values;
- is wired into `.github/workflows/test-build.yml`.

The shared runner's later W6 profile does not weaken API-1009: it selects a separate entry,
source closure, budget, and externals, while the API-1009 profile remains the default. The raw
runner hash was regenerated after that generalization and now matches the reviewed file exactly.

## Whole-page performance remains a separate open milestone

`docs/testing/evidence/api-1009-next-route-cold-attempt-raw.json` honestly records:

- 84,067.2 ms Next/Turbopack cold compile;
- 92,907.36 ms request duration;
- 9,109,176,320 bytes RSS;
- HTTP 500 before a successful page open;
- no successful Next incremental or key-interaction sample.

The failed attempt is not presented as a pass and is not substituted by the focused Vite result.
Under the review policy, the route can receive functional approval because its raw focused
performance evidence, bundle ratchet, browser closure, behavior, and real-I/O integration pass.
The page-level cold-start and interaction milestone remains blocked and must stay visible in the
progress document.

## Independent verification

Passing results:

```text
workspace-background-work contract + compatibility: 20/20
focused API-1009 behavior/routing: 11/11
full API: 210 passed, 5 skipped
disposable PostgreSQL 16 API-1009 fixture: 1/1
focused API TypeScript: passed
focused Sim client TypeScript: passed
full API TypeScript: passed
full Sim TypeScript: passed
API production build: passed, 1,066 modules
compile ratchet independent sample: 118 ms cold / 46 ms incremental
compile ratchet unit tests: 2/2
API-1009 client isolation: 2,898 gzip bytes
Workspace Forking module seam: 17 module files, 8 adapters, 2 contracts
browser runtime closure: passed, zero zero-budget violations
lightweight client surfaces: passed
target structure: 57 module roots, 100 required files
W2 route evidence coverage: 22/22 C/A/D/I
W2 generated facade isolation: 22 entries, largest 1,485 gzip bytes
W2 proxy TypeScript: passed
strict API validation: 991/991 Zod-backed, 0 non-Zod
wave migration validator: passed; accepted ledger unchanged at 16/1126 during review
```

## Handoff

The route may now be moved from `pending` to `approved` and added to W2
`completedInventoryIds` by the owning/root agent. That ledger mutation is intentionally outside
this independent reviewer task.

Do not report this approval as completion of the overall frontend speed objective. A later
independent frontend review must still approve a successful whole-page cold open, incremental
Next compile, and key interaction against their targets.

# Phase 5 handoff: W6 Group B execution control

Status: the latest independent final review left only external-object
deployability and a full-handler PostgreSQL query-budget regression open. Both
P1 items are now remediated and await a fresh uninvolved-agent re-review.
API-0138/API-0283/API-0993 remain outside the accepted ledger until that review
passes.

This handoff covers API-0138, API-0283, and API-0993. The working audit and
verification ledger are maintained in
`.scratch/sim2-platform-separation/issues/31-w6-group-b-execution-control.md`.

The frozen boundary is:

1. Browser and Next facades consume only focused versioned contracts.
2. Read handlers use narrow authorization and PG/job-read ports.
3. Resume polling is a versioned Worker command; API code cannot reach
   Executor, Sandbox, Redis, or runtime registries.
4. Heavy execution payloads are not materialized for ordinary status polling.

## Delivered

- Pure `@sim/api-contracts/execution-control` schemas.
- Pure `@sim/execution-contracts/resume-poll` command/result schemas.
- Native API execution-control module with hybrid auth, workflow authorization,
  DB/Trigger.dev job readers, workflow+execution scoped PG reads, conditional
  payload materialization, and cron-to-Worker command transport.
- Worker command endpoint with atomic PG claim/resuming transitions, a
  versioned resume execution transport, terminal/retry state persistence,
  stale-claim recovery, and same-execution-ID idempotency.
- Server-only `/api/internal/resume/execute` cutover bridge so
  `RESUME_EXECUTION_SERVICE_URL` can point Worker at the existing Sim Executor
  until that Executor becomes a native Worker engine. The bridge is isolated
  from all browser closures and authenticates with
  `INTERNAL_EXECUTION_TOKEN`.
- Server-only bounded external execution object materialization through
  `/api/internal/execution-objects/read`. It validates a versioned contract,
  exact workspace/workflow/execution scope, a 64 MiB ceiling, and an internal
  bearer before reusing donor `materializeExecutionData`.
- Production API composition always uses the object-aware materializer.
  Missing objects preserve donor-compatible null/empty output; absent service
  configuration or an unavailable/invalid HTTP service returns explicit 503
  for externalized rows instead of silently discarding the pointer.
- Three thin Next forwarding facades plus focused query hooks wired into the
  real paused-execution page.
- Contract, auth, tenant, method, error, Worker, proxy, closure, PG, build, and
  performance verification.

## Evidence

- Remediation source-bound Vite raw:
  `docs/testing/evidence/w6-execution-control-frontend-compile-raw.json`, cold
  209 ms; incremental 93 ms after editing and exactly restoring the real hook.
- Executable ratchet rerun: cold 82 / 5,000 ms; incremental 33 / 1,500 ms.
- The package exposes `measure:w6-execution-control-frontend-compile` and
  `check:w6-execution-control-frontend-compile`; the check is wired into test-build CI.
- The repository lightweight-surface CI records 83,133 gzip bytes / 104 inputs
  for the focused hook and 203,073 gzip bytes / 314 inputs for its real page;
  both forbid background queues, Redis, auth implementation, Registry,
  Executor, Sandbox, and DB paths.
- API build: 1,101 modules; Worker build: 244 modules.
- API, Worker, Sim, and both contract-package type checks passed.
- Fresh disposable PostgreSQL 16:
  - API tenant-bound execution reader plus full API-0993 handler/query budget:
    2/2. Ordinary, `includeOutput`, recursive `selectedOutputs`, failed,
    object-missing, and object-unavailable requests each execute exactly one
    SQL query. Payload paths add at most one real HTTP object read; ordinary
    status adds none. Object-present cases transfer a 1.5 MiB payload.
  - Worker/API HTTP/Sandbox HTTP durable resume state machine: 8/8.
- Strict API validation: 1001/1001 Zod-backed routes; client-boundary,
  browser-runtime-closure, and
  lightweight-surface gates passed.

## P1#5 deployable object-reader binding

- The shared V1 contract has request correlation, reference version/ID checks,
  exact object-key scope, and explicit `found`/`missing`/`unavailable` states.
- The Sim route is server-only and the production donor reader owns storage
  access. `apps/sim/package.json` declares `@sim/execution-contracts`.
- Configure the API with
  `EXECUTION_OBJECT_STORE_URL=<Sim base URL>` and set the same
  `INTERNAL_EXECUTION_TOKEN` in API and Sim. The client appends
  `/api/internal/execution-objects/read`.
- There is no browser facade or client import for this route/token. The focused
  hook and real page remain within their lightweight budgets.

## P1#8 executable handler query budget

The PostgreSQL suite mounts the actual Sim handler on a real Node HTTP server
and crosses it through the production API HTTP client and complete API-0993
application handler. It does not mock `fetch`. The ordinary, final-output,
recursive-selected-output, failed, missing, and service-unavailable cases all
hold SQL at one statement; materialized cases add at most one HTTP object read.
Raw evidence is in
`docs/testing/evidence/w6-execution-control-postgres-raw.json`.

Current focused verification:

- API 24/24, plus fresh-PG 2/2.
- Worker 4/4, plus fresh-PG durable resume 8/8.
- Sim facade/page/internal routes 12/12.
- API contracts 3/3; execution contracts 3/3.
- Biome focused files, strict validation, client boundary, browser closure,
  lightweight surfaces, package type checks, API build, and Worker build pass.

Current P1 remediation hashes:

- object-read contract:
  `9274d872648fceed570785239439c397faae569573fe00b4a26101de6bbc3918`
- Sim route:
  `3fcd0d44bd05875ab97980200daf582acd687bef691179e8bdeec31b5f6899df`
- Sim handler:
  `1155fc6d54cb96d9d50d80ae12a7834aaeb58488afb7d4f227304b701ab51e61`
- Sim donor reader:
  `c5d4a6d017134bbbca5986fa602a192f03d077eb5cf5630eac558f977397fee5`
- API HTTP reader:
  `21c38272eefb021bda3f52deac9d52c52861e4b53f4ec1fc75e9ad5800a35b01`
- API materializer:
  `16dc11df498c20cb18038e240db2b1f2c91c5ba62498ca3b4a82e5b9c3d6be38`
- full-handler PG regression:
  `70e5ca89903119c63b448c51e55f7661631c6ff7a3073b196225a1ce3ac69ce8`

# W6 Group B execution-control working log

## Frozen scope

- API-0138 `GET /api/jobs/[jobId]`
- API-0283 `GET /api/resume/poll`
- API-0993 `GET /api/workflows/[id]/executions/[executionId]`
- Donors are read-only: `D:\workspace\workflow\sim2`, `D:\polaris`.
- Implementation writes only to `D:\workspace\workflow\sim2-refactor`.

## Donor parity audit

The Sim2 and Polaris route files have identical SHA-256 hashes for all three
routes. This makes Sim2 the executable donor and Polaris a parity witness.

- API-0138: `497ff65034a5c322405449b22f8062e83d3416a38c6a4211bc88c723aaeef66b`
- API-0283: `c3bc76ae1eb3bbd0151eeabc1fc17aa179c436d87a24342b362eae7813025c4a`
- API-0993: `b062fd798ec4b9c9fc0ba23b6b5e7ccaf18a3ce0384b876af173eb317be55150`

### API-0138

- Hybrid identity is required and the actor must be a user.
- A job with `metadata.workflowId` is authorized through the workflow read
  policy. A workspace API key must also match the workflow workspace.
- Otherwise `metadata.userId` must match the authenticated user.
- A job with neither owner field is denied.
- Workflow ownership takes precedence when both fields exist.
- Response is a small status projection; output/error are conditional.

### API-0993

- Workflow read authorization precedes persistence reads in the target.
- Execution lookup is constrained by both workflow ID and execution ID.
- Paused lookup is also constrained by both IDs (security hardening over the
  donor's execution-ID-only query).
- Paused/partially-resumed state overrides the log status.
- Heavy execution data is materialized only for failure, requested final
  output, or requested block outputs. This fixes the donor's unconditional
  materialization.

### API-0283

- The public GET endpoint remains cron-authenticated for compatibility.
- The API does not import Redis, Executor, Sandbox, pause managers, or workflow
  registries.
- State advancement crosses a versioned command into Worker.
- Worker owns the command endpoint and poll coordinator. The API owns only
  cron authentication, transport, timeout, and response projection.

## Boundary decisions

- Pure browser-safe route schemas live in
  `@sim/api-contracts/execution-control`.
- Pure API-to-Worker schemas live in
  `@sim/execution-contracts/resume-poll`.
- The API exposes one `ExecutionControlModule` with three focused handlers and
  narrow ports.
- PG readers stay in API infrastructure; the resume mutation stays in Worker.
- Next route files are forwarding facades and depend only on a focused proxy
  module.
- No route imports the global tool registry, Executor, Sandbox, encryption, or
  UI tool definitions.

## Verification ledger

- [x] API contracts: 33 assertions passed; execution contracts: 7 passed
- [x] execution-control module/import/Trigger adapter: 20 focused API tests passed
- [x] auth/tenant/method/error/differential fixtures
- [x] fresh disposable PostgreSQL 16 API reader/query-budget test: 1 passed
- [x] fresh disposable PostgreSQL 16 Worker state-machine integration: 8 passed
- [x] Worker command tests: 2 passed
- [x] facade/proxy/real-consumer interaction tests: 8 passed
- [x] import-closure and bundle ratchets
- [x] API, Worker, Sim, and contract-package type checks
- [x] API build: 1,086 modules; Worker build: 241 modules
- [ ] independent remediation re-review by an uninvolved agent

## Independent-review remediation

- API-0283 no longer counts a pending insert as dispatch. Worker transactionally
  claims the queue entry and moves the pause point to `resuming`, calls a
  versioned `ResumeExecutionRunner`, then atomically records
  `completed`/`failed` plus `fully_resumed`/`partially_resumed`/retry state.
- The durable resume integration proves the real
  API HTTP client -> Worker HTTP -> PostgreSQL -> Sandbox HTTP execution chain.
  It freezes success, duplicate suppression, retry, incomplete current
  metadata, bounded legacy snapshot fallback, local overlap, independent
  multi-poller serialization, chained already-due pause points, stale-claim
  recovery, internal-token rejection, and contract-version rejection.
- A server-only cutover bridge at `/api/internal/resume/execute` lets Worker
  invoke the existing Sim Executor while the Executor migration is still in
  progress. `RESUME_EXECUTION_SERVICE_URL` selects that bridge; the versioned
  transport uses the claimed queue entry as its idempotency key. This keeps the
  legacy Executor out of browser and API-module closures without making the
  Worker state machine test-only.
- Resume execution keeps `newExecutionId` equal to the parent execution ID.
  A queue entry ID is the idempotency key at the execution-service boundary.
- Externalized `traceStoreRef` data is materialized only on the server through
  a bounded internal HTTP object-store adapter. Existing objects restore final
  output, trace-selected outputs, and failure errors; missing objects degrade
  to inline markers.
- API-0138 and API-0993 validate route/query inputs before authentication.
  Trigger.dev reader errors containing `not found` map to donor-compatible 404.
  The undocumented 256-character job-ID restriction was removed.
- Execution log plus optional pause overlay now use one tenant-bound SQL left
  join. The fresh-PG test injects a query counter and freezes one SQL builder
  execution per status read; payload materialization does not add a DB read.
- The focused status hook is used by the real paused-execution page. Terminal
  states stop polling, Refresh invalidates both detail and focused status, and
  the real page has an interaction test and lightweight-closure budget.

## Performance evidence

- Remediation source-bound Vite raw: cold 67 ms, incremental 27 ms
  (budgets 5,000/1,500 ms).
- Final ratchet check: cold 209 ms, incremental 78 ms.
- Source restoration hash matched the original hook hash.
- Raw evidence is stored at
  `docs/testing/evidence/w6-execution-control-frontend-compile-raw.json`; package scripts and
  test-build CI execute the same runner and fixed budget.
- Focused hook closure: 83,133 gzip bytes / 104 inputs.
- Real paused-execution page closure: 203,073 gzip bytes / 314 inputs.
- Forbidden closure scan found no registry, Executor, Sandbox, encryption, DB,
  Drizzle, Redis, Feishu, or Meegle imports.
- API production build: 1,075 modules. The Trigger.dev SDK was deliberately
  replaced by its narrow authenticated HTTP read adapter, avoiding a 432-module
  server bundle increase.

## Operational notes

- Trigger.dev status reads are enabled only when `TRIGGER_DEV_ENABLED` and
  `TRIGGER_SECRET_KEY` are configured; otherwise the real PG async-jobs reader
  is used.
- Resume polling and durable state transitions are Worker-owned. The public API
  only authenticates cron and sends a versioned command.
- `SANDBOX_SERVICE_URL` plus `INTERNAL_EXECUTION_TOKEN` configure the production
  resume-execution transport when the Sandbox owns resume execution.
  `RESUME_EXECUTION_SERVICE_URL` instead targets the transitional Sim server
  bridge at `/api/internal/resume/execute`. Missing configuration produces a
  persisted, retryable failure rather than a false successful dispatch.
- `EXECUTION_OBJECT_STORE_URL` plus `INTERNAL_EXECUTION_TOKEN` configure
  external execution payload recovery. Inline payloads remain local, while
  missing/unreadable objects degrade to inline markers.

## Remediation freeze (2026-07-30)

Implementation and author verification are frozen for uninvolved-agent
re-review. No accepted-ledger/index entry was changed.

- Focused API/object-store/import/Trigger tests: 22/22.
- Worker HTTP command/runner tests: 4/4.
- Sim facade/proxy/real-page/internal-bridge tests: 10/10.
- API contracts: 33/33; execution contracts: 7/7.
- Fresh PostgreSQL 16.14 Worker state machine: 8/8.
- Fresh PostgreSQL 16.14 API reader/query budget: 1/1.
- API, Worker, Sim, and both contract-package type checks: pass.
- API build: 1,086 modules; Worker build: 241 modules.
- Biome: 50 focused files pass.
- Strict API validation: 992/992; client-boundary: pass.
- Lightweight hook/page closure and focused Vite compile ratchet: pass.
- Raw Vite evidence remains source-bound to runner
  `8ab2f306120292e2be8d1e5731065dda5d1c4f496973e5b0813a4c408352d727`,
  hook `5ecc58074b147443296724bd1a5ac873f0bd5293377aeb5960ded04617cd0671`,
  focused Sim contract
  `9b36aafced1ec1aab8546c147f7f28fd95791e5095abb10062c3fdf4f84b383e`,
  and API contract
  `208aa6e144aa9b1e0647f9eab8f411bbdc625fdda371b491daebfd9452a1feb2`.

Known work intentionally outside this batch:

- Native Worker ownership of the full legacy Executor remains a later
  migration. The versioned server-only cutover bridge keeps current production
  behavior available until that move.
- Deployment must supply the resume/object-store service URLs and shared
  internal token; missing resume configuration is deliberately a persisted
  retryable failure.
- Next route cold-start optimization remains the separate review item recorded
  by the first reviewer.

## Final-review P1#5 / P1#8 closure (2026-07-30)

The latest independent review left external-object deployability and a
full-handler PostgreSQL query-budget regression open. Both scopes are now
implemented and frozen for another uninvolved review.

### P1#5: deployable external execution object loop

- Added `@sim/execution-contracts/execution-object-read`: V1 command/result
  envelopes, request correlation, exact workspace/workflow/execution storage
  key, reference version/ID validation, and 64 MiB upper bound.
- Added the authenticated server-only Sim endpoint
  `/api/internal/execution-objects/read`. It bounds commands at 64 KiB,
  validates the shared contract, compares the internal bearer, and delegates
  storage ownership to donor `materializeExecutionData`.
- API production composition no longer selects the pointer-dropping inline
  materializer. A configured URL uses the bounded real HTTP client; an absent
  URL uses an unavailable store that affects only externalized rows and
  produces explicit API-0993 503.
- Missing objects remain donor-compatible (`finalOutput: null`, empty selected
  outputs). Transport, response-size, request-ID, version, or response-contract
  failure is unavailable and therefore 503.
- Deployment binding: API
  `EXECUTION_OBJECT_STORE_URL=<Sim base URL>` and the same
  `INTERNAL_EXECUTION_TOKEN` in API and Sim. The client appends the internal
  route path. No browser proxy or client import exposes it.
- The real integration does not mock `fetch`: API-0993 calls the production
  client across a real Node HTTP listener into the actual Sim handler.

### P1#8: full API-0993 handler query budget

Fresh disposable PostgreSQL 16.14 passed 2/2:

| request | SQL | object HTTP reads | result |
| --- | ---: | ---: | --- |
| ordinary externalized status | 1 | 0 | 200 |
| `includeOutput=true`, 1.5 MiB object | 1 | 1 | final output restored |
| recursive `selectedOutputs` | 1 | 1 | nested output restored |
| failed execution | 1 | 1 | external error restored |
| object missing | 1 | 1 | donor-compatible null/empty output |
| object service unavailable | 1 | 1 | explicit 503 |

The container reported
`PostgreSQL 16.14 (Debian 16.14-1.pgdg13+1)` and was removed after the API and
8/8 Worker durable-resume suites passed. Machine-readable evidence:
`docs/testing/evidence/w6-execution-control-postgres-raw.json`.

Final author verification:

- API focused 24/24; fresh-PG handler/reader 2/2.
- Worker focused 4/4; fresh-PG durable resume 8/8.
- Sim facades, real page, resume bridge, and object route 12/12.
- API contracts 3/3; execution contracts 3/3.
- API/Worker/Sim/both contracts type checks: pass.
- API build 1,101 modules; Worker build 244 modules.
- Strict validation 1001/1001; client-boundary, browser-runtime-closure,
  lightweight-surface, focused Biome, and Vite compile ratchets: pass.
- Vite raw 209 ms cold / 93 ms incremental; ratchet 82 / 5,000 ms cold and
  33 / 1,500 ms incremental.

Current hashes:

- object contract:
  `9274d872648fceed570785239439c397faae569573fe00b4a26101de6bbc3918`
- Sim route:
  `3fcd0d44bd05875ab97980200daf582acd687bef691179e8bdeec31b5f6899df`
- Sim handler:
  `1155fc6d54cb96d9d50d80ae12a7834aaeb58488afb7d4f227304b701ab51e61`
- donor reader:
  `c5d4a6d017134bbbca5986fa602a192f03d077eb5cf5630eac558f977397fee5`
- API HTTP client:
  `21c38272eefb021bda3f52deac9d52c52861e4b53f4ec1fc75e9ad5800a35b01`
- API materializer:
  `16dc11df498c20cb18038e240db2b1f2c91c5ba62498ca3b4a82e5b9c3d6be38`
- full-handler PG test:
  `70e5ca89903119c63b448c51e55f7661631c6ff7a3073b196225a1ce3ac69ce8`

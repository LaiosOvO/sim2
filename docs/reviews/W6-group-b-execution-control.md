# W6 Group B execution-control independent review

Review status: **CHANGES REQUIRED**

Reviewed inventory:

- API-0138 `GET /api/jobs/[jobId]`
- API-0283 `GET /api/resume/poll`
- API-0993 `GET /api/workflows/[id]/executions/[executionId]`

Donors were read only:

- `D:\workspace\workflow\sim2`
- `D:\polaris`

The three Sim2 and Polaris donor route pairs are byte-identical. Their SHA-256
values are:

- API-0138: `497ff65034a5c322405449b22f8062e83d3416a38c6a4211bc88c723aaeef66b`
- API-0283: `c3bc76ae1eb3bbd0151eeabc1fc17aa179c436d87a24342b362eae7813025c4a`
- API-0993: `b062fd798ec4b9c9fc0ba23b6b5e7ccaf18a3ce0384b876af173eb317be55150`

## Outcome

The browser/API boundary is materially better: the three Next routes are thin
facades, the focused browser contract does not import Executor, Sandbox, DB,
Redis, encryption, Feishu, Meegle, or the tool registries, and the native API
and Worker build independently.

That boundary work is not sufficient to approve the migration. API-0283
currently reports a successful dispatch after inserting a row that no runtime
can execute. API-0993 also loses externally stored execution output and errors.
There are additional donor validation/error-order drifts and missing
end-to-end coverage.

## Blocking findings

### P0: the Worker poll command does not advance or resume an execution

`apps/worker/src/jobs/resume/create-drizzle-resume-poller.ts` leases a
`paused_executions` row and inserts a `resume_queue` row with `status =
'pending'`. There is no `resume_queue` claimant, consumer, or resume executor
anywhere under `apps/worker/src`. The API and Worker therefore return
`dispatched: 1` for queue admission, not state advancement.

The inserted row is not compatible with the existing Sim queue consumer
either:

- The Worker leaves the pause point at `resumeStatus = 'paused'`.
- `PauseResumeManager.processQueuedResumes` only accepts a pending row whose
  pause point is already `resumeStatus = 'queued'`; otherwise it marks the row
  failed with `Pause point is no longer queued`.
- The donor atomically transitions the point to `queued` or `resuming`, while
  the Worker does neither.
- The donor keeps the resume execution ID equal to the parent execution ID.
  The Worker invents `<parent>:resume:<uuid>` without a downstream consumer or
  compatibility proof.
- The donor performs resume admission/preprocessing, legacy resume-metadata
  fallback, snapshot-size safety, `snapshotReady` validation, and then invokes
  the resume execution primitive. The Worker performs none of these steps.

The lease is also left in `nextResumeAt` after successful queue insertion and
`automaticResumeRetryCount` is incremented on every claim, including success.
When the lease becomes due again, the row can be claimed again, find the
existing pending entry, report `dispatched: 0`, increment the retry count, and
remain paused indefinitely.

The optimistic update is not a complete atomic state transition: its `WHERE`
clause compares ID and `nextResumeAt`, but does not recheck the paused status or
pause-point state. A resume that races between candidate selection and update
can therefore still be leased from stale data.

#### Fresh PostgreSQL 16 evidence

A fresh disposable PostgreSQL 16.14 container was used for this review.

The committed
`apps/api/tests/w6/native-execution-control.postgres.test.ts` passed, but that
test only exercises the job and execution read adapters. It does not create
`resume_queue`, invoke the real poller, or advance an execution.

The reviewer then exercised the real chain:

`HttpWorkerResumePollCommand -> Worker HTTP server -> WorkerApplication -> DrizzleResumePoller -> PostgreSQL`

The result was:

```text
{"status":"completed","claimedRows":1,"dispatched":1,"failures":[]}
```

The database state immediately afterwards was:

```text
paused execution status       = paused
automatic resume retry count  = 1
pause point resumeStatus      = paused
resume_queue status           = pending
new execution ID              = execution-http:resume:<uuid>
```

After making the lease due again and polling a second time, the real result was
`claimedRows: 1, dispatched: 0`; the retry count changed from 1 to 2, while the
execution and pause point remained paused and only one pending queue row
existed.

This is a functional migration blocker, not only a missing test.

### P1: API-0993 cannot materialize an existing externalized execution payload

The production composition always installs
`createInlineExecutionPayloadMaterializer`. That adapter removes
`traceStoreRef` and returns only inline markers. It never attempts to fetch the
referenced object.

The donor calls `materializeExecutionData`, which reads the externalized object
and recovers `finalOutput`, `error`, and `traceSpans`, degrading to markers only
when the object is genuinely missing or unreadable. The new implementation
degrades for every externalized row, including when the object exists.

Consequences include:

- `includeOutput=true` can return `finalOutput: null` for a completed run.
- `selectedOutputs` can return an empty object even when trace spans exist.
- a failed execution can return `error: null`.

There is no object-store materializer adapter or externalized-payload contract
test.

### P1: donor validation and error precedence is not preserved

For API-0138 and API-0993 the donor parses route/query inputs before
authentication. The native module authenticates first and parses afterwards.
The focused test explicitly freezes the drift by expecting an unauthenticated,
malformed encoded job ID to return 401. The donor returns its validation
response before reaching authentication.

API-0138 also maps a thrown error whose message contains `not found` to 404.
The native module maps every thrown job-reader error to 500. Neither
differential case is covered by donor/native fixtures.

The new job-ID contract also adds a 256-character maximum not present in the
donor contract. That may be a reasonable new limit, but it is currently an
undocumented compatibility change.

These changes need either donor parity or an explicit, approved compatibility
decision with frozen tests for both native and facade paths.

### P1: the new browser hook has no real consumer

`useJobStatus` and `useWorkflowExecutionStatus` occur only in
`apps/sim/hooks/queries/execution-control.ts`; no page or component imports
either hook. The focused compile and bundle measurements therefore prove that
an isolated proposed surface is light, not that a real user-facing execution
status path was migrated.

Wire the focused hook into the actual consumer and test that interaction, or
remove the dead hook and measure the real consumer that replaces it.

### P1: real queue/HTTP behavior and query bounds are not committed as tests

The committed Worker tests inject a fake `ResumePoller`. They do not exercise:

- `createHttpWorkerResumePollCommand`;
- Worker internal-token authentication and request/response validation;
- the real Drizzle poller;
- queue leasing/idempotency/state transition;
- queue claiming/execution/completion/failure;
- multi-poller concurrency;
- legacy paused snapshots or incomplete metadata.

The PostgreSQL execution-control test covers only reads. The existing "query
ratchet" is a source-string assertion that both IDs appear in Drizzle source;
it does not enforce a fixed database query count.

## Evidence and gates that passed

- API contracts: 3 tests passed.
- execution contracts: 1 test passed.
- focused API module/boundary/Trigger adapter: 16 tests passed.
- focused Worker command: 2 tests passed.
- Next facade/proxy: 6 tests passed.
- API, Worker, API-contract, and execution-contract type checks passed.
- API build passed at 1,075 modules.
- Worker build passed at 236 modules.
- fresh PostgreSQL 16 read-adapter integration: 1 test passed.
- W6 Group B source-bound compile check passed at 549 ms cold and 31 ms
  incremental against 5,000/1,500 ms budgets; the source was restored exactly.
- The committed raw compile evidence is bound to runner SHA-256
  `8ab2f306120292e2be8d1e5731065dda5d1c4f496973e5b0813a4c408352d727`
  and its hook/contract hashes match the current files.
- The package check/measure commands and test-build CI step are present.
- The repository lightweight browser gate includes the real W6 hook and passed
  at 83,043 gzip bytes / 104 inputs with its heavy-runtime path denylist.
- browser runtime closure and client-boundary gates passed.

The repository-wide strict API validation audit failed because four concurrent
W5 blocks/custom-blocks routes were temporarily classified as non-Zod. That
failure is outside these three W6 Group B routes and is not used as a W6
finding.

The separate `w6-execution-control-browser-bundle-budget.json` claim of
82 modules / 474,918 bytes is not itself wired to a checker. An independent
Vite build observed 83 module IDs and a different byte definition. The
repository lightweight-surface gate is reproducible and should be treated as
the authoritative browser gate, or the older standalone claim should gain a
reproducible runner and measurement definition.

## Required remediation before re-review

1. Make API-0283 cause real Worker-owned state advancement. Either claim and
   execute the resume atomically, or add and run a durable queue consumer. Do
   not count a non-executable pending insert as `dispatched`.
2. Preserve the queue/pause invariants in one transactional design:
   paused/queued/resuming transitions, compatible execution IDs, snapshot
   readiness, preprocessing/admission, retry semantics, and recomputed or
   cleared `nextResumeAt`.
3. Add fresh-PG integration that proves a due time pause reaches an actual
   resume terminal/advanced state, plus duplicate, concurrent, retry,
   incomplete-metadata, and legacy-snapshot cases.
4. Add a real API-to-Worker HTTP integration with internal-token rejection and
   contract-version failures.
5. Add a server-only external payload materializer and object-present /
   object-missing tests for final output, selected block outputs, and failure
   errors.
6. Resolve and freeze validation/auth/error-order compatibility for API-0138
   and API-0993.
7. Connect the focused query hook to a real UI consumer and retain the current
   compile/lightweight gates around that consumer.
8. Add an executable query-count bound for ordinary status polling and
   payload-request polling.

Next-route cold-start work remains a separate review item and is neither
approved nor rejected by this W6 Group B review.

## Final independent remediation re-review (2026-07-30)

Final verdict: **CHANGES REQUIRED**

This re-review was performed against the current filesystem state by an agent
that did not implement the remediation. The accepted ledger was not modified.
The worktree is a mixed dirty worktree based on
`acd7c56335a90f89edf7c8e8ec57d05f980a2aed`; conclusions below are bound to the
actual files read and tested, not only to that commit or to the handoff claims.

### Remediation disposition

1. **Closed:** API-0283 no longer reports a pending, unexecutable insert as a
   dispatch. The Worker transactionally writes `claimed` plus `resuming`, calls
   a versioned runner, and counts `dispatched` only after an `ok` runner result.
2. **Closed:** the PG state machine uses the parent execution ID, requires a
   ready time pause, bounds legacy snapshot loading, serializes admission with
   row locks, clears or recomputes `nextResumeAt`, persists retry/intervention
   state, and recovers stale claims with the same queue-entry idempotency key.
   The transitional Sim bridge invokes the existing resume primitive, whose
   resume path performs preprocessing/admission before execution.
3. **Closed:** a fresh disposable PostgreSQL 16.14 run passed all 8 durable
   state-machine cases, including terminal advancement, duplicate suppression,
   retry, incomplete and oversized metadata, overlapping and independent
   pollers, chained due points, and stale-claim recovery.
4. **Closed:** the real API HTTP client -> Worker HTTP endpoint boundary is
   exercised, including internal-token rejection and contract-version
   rejection. The PG suite also crosses a real Sandbox HTTP server before
   persisting terminal/retry state.
5. **Open/blocking:** the external-payload implementation is not a deployable
   end-to-end path in this repository. Details are in the first finding below.
6. **Closed:** API-0138 and API-0993 now validate route/query inputs before
   authentication, malformed percent-encoding is frozen at 400, Trigger.dev
   reader errors containing `not found` map to 404, and the undocumented
   256-character job-ID limit is absent.
7. **Closed:** `useWorkflowExecutionStatus` is consumed by the real
   paused-execution page; its status and Refresh interaction test passed, as did
   the hook and page lightweight closure budgets.
8. **Open/blocking:** the committed PG counter does not execute or bound the
   payload-request handler path. Details are in the second finding below.

### Blocking findings

#### P1: externalized execution payloads still silently degrade in a valid production composition

`createProductionApiOptions` installs the object-store materializer only when
`EXECUTION_OBJECT_STORE_URL` is set. If that optional variable is absent, it
installs `createInlineExecutionPayloadMaterializer`, which removes
`traceStoreRef` and returns only inline markers. The native route remains
available and returns successful responses, so existing externalized rows can
again produce `finalOutput: null`, empty selected outputs, or `error: null`
instead of surfacing a missing required dependency.

When the variable is set, `createHttpExecutionObjectStore` posts to
`/internal/execution-objects/read`. A repository-wide source search found that
literal only in the HTTP client and its mock-fetch test; there is no server
route, versioned server contract, deployment binding, or real HTTP integration
for that endpoint in this repository. `EXECUTION_OBJECT_STORE_URL` itself
occurs only in API composition and an unrelated environment-cleanup test. The
object-present module test injects a fake `ExecutionObjectStore`, while the HTTP
adapter test injects `fetch`; neither proves that an existing donor object can
be read by a deployable target service.

This leaves required remediation 5 incomplete. Minimum acceptance for the next
review:

- provide a deployable, authenticated bounded reader for the donor execution
  object store (or a direct server-only adapter with equivalent ownership);
- make missing required materialization configuration fail readiness or return
  an explicit unavailable response instead of silently selecting the
  pointer-dropping adapter for externalized rows; and
- add real HTTP object-present and object-missing integration through the
  API-0993 handler, freezing final output, recursive selected output, and
  failure error behavior.

#### P1: the executable query budget does not cover payload-request polling

`native-execution-control.postgres.test.ts` wraps `db.select`, calls
`ExecutionStatusReader.read` directly, and proves one SQL builder execution for
an ordinary matching read (then one more for a separate wrong-tenant read). It
does not call the execution-control HTTP/application handler and never sends
`includeOutput=true` or `selectedOutputs`.

The module-level payload tests use a fake execution reader, so combining the two
test files still does not create an executable database-query bound for the
payload-request path required by remediation 8. The source currently appears to
reuse the one-query reader, but a source inference is not the requested
regression gate.

Minimum acceptance is a PG-backed handler test that runs ordinary status,
`includeOutput=true`, selected-output, and failed-execution requests and asserts
the fixed SQL count for each (and, for externalized rows, a bounded single
object-store read without an added database query).

### Independent source and donor evidence

The Sim2 and Polaris donor pairs remain byte-identical:

- API-0138:
  `497ff65034a5c322405449b22f8062e83d3416a38c6a4211bc88c723aaeef66b`
- API-0283:
  `c3bc76ae1eb3bbd0151eeabc1fc17aa179c436d87a24342b362eae7813025c4a`
- API-0993:
  `b062fd798ec4b9c9fc0ba23b6b5e7ccaf18a3ce0384b876af173eb317be55150`

Selected current target hashes:

- API control module:
  `c7c0ef387c3799908e8bf6ff6399ac159caa7874561e810f0515ca62f9635bdf`
- one-query PG reader:
  `66b50beb7bf91e2078687d9bba2ecb3cd7a80715e4b294958ff69e584ae041a3`
- object materializer:
  `6d6d19f3c07f239b2e5e7daa62becebeffc06ce4b13a62d48c2d4fcc0f9b8f62`
- object HTTP client:
  `fcda8fbbe246c2412a6d0b45dd4d72f76e29cf5026a36b1a9f8b3cdca595c3e9`
- Worker resume poller:
  `bc075614883abdde0fd1abb8d188bce5d60729bd2e139b0e5c2dda9cd9c8c49b`
- Worker HTTP resume runner:
  `275956c35bcf915a7a5763e29d23528d69c18bd3d3e2c81efdc71d199385a706`
- Sim resume bridge:
  `1306f74e1a035b653a2879833de456f24d4d778f414424446bc09b3ccbe6af35`
- focused hook:
  `5ecc58074b147443296724bd1a5ac873f0bd5293377aeb5960ded04617cd0671`
- real page:
  `3b235a198a69f0416ce8f1917fbc4367934c75c0ede9cfdfe11c3368a268efce`

The committed compile raw is genuinely source-bound at this reviewed state:
its runner, hook, Sim contract, and API contract hashes all exactly match the
current files. The executable lightweight-surface check additionally built the
current real page, rather than relying on a stored page hash.

### Independently rerun verification

- Focused API module/object/import/Trigger tests: 22/22 passed.
- Focused Worker command/runner tests: 4/4 passed.
- Sim facade/proxy/bridge/real-page interaction tests: 10/10 passed.
- API contract tests: 3 tests passed; execution contract tests: 1 test passed.
- Fresh PostgreSQL 16.14 Worker/API/Sandbox HTTP state machine: 8/8 passed.
- Fresh PostgreSQL 16.14 API read adapter/query-counter suite: 1/1 passed, with
  the payload-path limitation described above.
- API, Worker, Sim, API-contract, and execution-contract type checks passed.
- API build passed at 1,099 modules; Worker build passed at 244 modules. These
  counts include concurrent non-W6 work in the mixed worktree.
- W6 source-bound compile ratchet passed at 84 ms cold and 49 ms incremental
  against 5,000/1,500 ms budgets, restoring the hook hash exactly.
- Lightweight surfaces passed: focused hook 83,133 gzip bytes / 104 inputs;
  real page 203,073 gzip bytes / 314 inputs; no configured heavy-runtime
  leakage.
- strict API validation passed at 1,000/1,000 Zod-backed routes; client-boundary
  and browser-runtime-closure gates passed.

An initial root-scoped multi-package Vitest command was not a valid test run
because root Vitest configuration does not resolve the per-application `@/`
aliases. Every affected suite was rerun from its owning package with its actual
configuration and produced the passing results above.

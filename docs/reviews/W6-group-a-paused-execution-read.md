# W6 Group A paused-execution read final independent review

Result: **approved**

Approval scope: **functional route approval only**

Routes:

- API-0282 `GET /api/resume/[workflowId]/[executionId]`;
- API-0996 `GET /api/workflows/[id]/paused/[executionId]`;
- API-0997 `GET /api/workflows/[id]/paused`.

Implementation agent: `/root/api1037_donor_audit`

Earlier remediation/review agent:
`/root/api1037_donor_audit/w6_group_a_independent_review`

Final independent reviewer: `/root/api1009_independent_rereview`

Review date: 2026-07-30

The final reviewer did not implement W6 Group A and did not modify the accepted-route ledger or
Git index. This decision follows `docs/testing/migration-independent-review-policy.md`.

API-0282, API-0996, and API-0997 are eligible to enter the accepted API-route ledger. This approval
does **not** approve the overall frontend-performance milestone. The recorded Next cold journey is
still above 10 seconds, and a successful final-source whole-page incremental/key-interaction
measurement remains outstanding.

## Final decision

Every functional blocker from the previous reviews is closed:

1. the execution-read module and its PostgreSQL adapters are installed in production composition
   and present in the API build;
2. resume queue reads require both the requested parent execution and the authorized paused-row ID;
3. the real Resume page and query hook use focused contracts and no longer reach
   `PauseResumeManager`, Executor, or the monolithic workflow contract;
4. the disposable PostgreSQL fixture is valid and covers cross-workflow queue isolation plus
   archived-workflow precedence;
5. workflow/API-key/personal/internal actor and malformed-parameter precedence is frozen;
6. persisted dynamic JSON is explicitly projected through strict public DTOs;
7. GET, HEAD, OPTIONS, unsupported-method, and unrelated-path behavior matches the donor;
8. final-source cold/incremental evidence, fixed budgets, package scripts, CI enforcement, bundle
   budgets, and browser-closure checks all pass.

No new route behavior, tenant-isolation, secret-projection, production-composition, method-parity,
or final-consumer dependency defect was found.

## Donor compatibility

The review reused the direct donor comparison against:

- `D:\workspace\workflow\sim2`;
- `D:\polaris`.

The three donor routes and workflow middleware remain equivalent between Sim2 and Polaris.

| Concern | Donor behavior | Target behavior | Decision |
| --- | --- | --- | --- |
| API-0282 path | exact resume detail path | exact native route | match |
| API-0996 path | exact paused detail path | exact native route | match |
| API-0997 path | exact paused list path | exact native route | match |
| GET | invokes route behavior | invokes native handler | match |
| HEAD | automatic GET semantics, body omitted | GET auth/handler semantics, body omitted | match |
| OPTIONS | 204, `Allow: GET, HEAD, OPTIONS` | same | match |
| unsupported method | 405 without `Allow` | same | match |
| unrelated path | route does not match | module falls through | match |
| authentication | hybrid session/API-key/internal | same policy | match |
| service actor | authenticated but rejected at user-only seam | same | match |
| malformed params | authenticated request reaches 400 validation | same | match |
| workflow visibility | missing/archived returns 404 before scope disclosure | same | match |
| personal workflow | active unattached workflow returns frozen 403 | same | match |
| workspace-key mismatch | frozen 403 before canonical permission denial | same | match |
| detail lookup | workflow + execution | same | match |
| queue isolation | inherited donor used parent execution only | parent execution + authorized paused-row ID | approved hardening |
| list order | `pausedAt DESC`, no artificial limit | same | match |
| status query | comma split/trim; empty means no filter | same | match |
| time-only pause | detail 404/list hidden | same | match |
| pause summary | point count and resumed count recalculated | same | match |
| loop block ID | removes all `_loop\d+` suffixes | same | match |
| resume UI URL | query removed | same | match |
| unexpected error | donor detail could expose message | safe 500 + request ID | approved hardening |

The observation headers `x-sim-api-module`, `x-sim-api-inventory-id`, and
`x-sim-api-backend=native` are an approved operational addition.

## Authorization and PostgreSQL isolation

Production composition creates:

- `createExecutionReadModule`;
- `createDrizzlePausedExecutionReader`;
- `createDrizzleWorkflowReadScopeReader`;
- `createPlatformWorkflowReadAuthorizer`;
- detail/list use cases and handlers.

The application module owns exact route selection and the shared identity policy behind one small
`handle()` interface. Detail and list behavior remain behind two deep handlers. PostgreSQL and
in-memory adapters exercise the same application seam.

The final reviewer reran the integration suite against a dedicated disposable
`postgres:16-alpine` database with `SIM_TEST_DATABASE_DISPOSABLE=1` and
`SIM_REQUIRE_POSTGRES_TEST=1`. The container was removed after the test.

The passing fixture proves:

- active workflow scope resolves normally;
- archived workspace and archived personal workflows return 404 before credential-scope or
  personal-workflow disclosure;
- detail queue rows require both
  `resume_queue.parent_execution_id = executionId` and
  `resume_queue.paused_execution_id = authorizedPausedRow.id`;
- a malicious row owned by another workflow but reusing the parent execution ID and containing a
  secret never enters the response;
- detail/list tenant filters, time-only filtering, queue ordering, and narrow list snapshot
  projection remain intact.

## Strict public projection

The persistence adapter projects only needed columns. The projection module constructs public
objects field by field for:

- resume links;
- loop and parallel scopes;
- serialized execution snapshot;
- queue entries and resume input;
- paused execution detail and summary.

Focused tests prove that credential IDs, internal cursors, encryption-key sentinels, decrypted
credentials, and unknown outer fields do not cross the contract, while legitimate dynamic JSON
values—including primitives, arrays, objects, and null—retain their wire value. Malformed
historical snapshots follow the frozen rejection policy rather than leaking an unvalidated object.

## Final Resume consumer seam

The server page now reads API-0282 through `proxyW6ExecutionReadRequest` and validates the response
with `@sim/api-contracts/execution-read`. The client page imports:

```text
@sim/emcn/resume
apps/sim/lib/browser/resume-view-model.ts
apps/sim/hooks/queries/resume-execution.ts
apps/sim/lib/api/contracts/execution-read.ts
```

It does not import:

- `PauseResumeManager` or `human-in-the-loop-manager`;
- Executor or Sandbox implementations;
- the old workflows contract;
- workflow middleware;
- DB/auth/secret/encryption implementations;
- the `@sim/emcn` package root;
- the `lucide-react` runtime root barrel.

`@sim/emcn/resume` is a focused subpath. Its icon wrapper imports explicit
`lucide-react/dist/esm/icons/*.js` files. The page-specific lightweight-surface gate forbids
`node_modules/lucide-react/dist/esm/lucide-react.js`; the final build passes that negative rule.

Current lightweight surfaces:

| Surface | Gzip bytes | Inputs | Budget |
| --- | ---: | ---: | ---: |
| Resume execution hook | 84,639 | 107 | 88,000 |
| Resume execution page client | 202,347 | 311 | 210,000 |
| Execution-read contract | 64,927 | 79 | 68,000 |

All report no heavy-runtime leakage.

The repository browser-closure ratchet reports:

- Executor: 270 client roots;
- execution-and-sandbox: 239 client roots;
- API/Worker: 0 client roots;
- Infra extensions: 0 client roots;
- zero-budget violations: 0.

The remaining inherited global closure counts are not attributed to the W6 final consumer and
remain wider refactor work.

## Final-source compile evidence

The raw evidence is
`docs/testing/evidence/w6-resume-frontend-compile-raw.json`. Every recorded source and runner hash
matches the final worktree:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| Resume page client | 38,072 | `c3f48e4e3d853fed65e44fb6c0a9d5299c4b7f33cd2e7a9b744958521ce3a28f` |
| browser view-model | 711 | `56e50d0109ecc878c1cb8b3ed2b06297e234c4910aedb51adf38abf5cdd47558` |
| resume query hook | 4,688 | `b9c057f7ff5d667bf78529179afcd1fddc97bd5bdade490898f03f25a44602ca` |
| focused Sim contract | 2,078 | `0808e5953409c1e31d48492ed8165fda1c57c70bbdf5dbfe1489cc3d10ce8401` |
| focused EMNC entry | 647 | `15f4b9933e65cce28a3558fedccb036b7f6d7cc5949d9b31d08fd74c2fd1c7f2` |
| direct Lucide wrapper | 1,484 | `5c30b24072d08451f9234cef0cae40d2721ac73304ba683c680d069c3c256bf4` |
| measurement runner | 11,978 | `00cbbadcc1d8b7d35ba2a7df1f2108723fa2361136358dabef38ff2a91c3823e` |

The committed raw sample is 331 ms cold and 138 ms incremental. The final independent check
sample is 409 ms cold and 128 ms incremental.

The runner performs a real, reversible source edit:

1. starts a fresh Vite watch build from the real Resume page client;
2. records the first bundle as cold compile;
3. appends a valid source probe to that tracked file;
4. waits for the next watch bundle;
5. restores the exact original content;
6. verifies original, edited, and restored hashes.

The independent run restored the entrypoint to
`c3f48e4e3d853fed65e44fb6c0a9d5299c4b7f33cd2e7a9b744958521ce3a28f`.

The fixed budget file is `docs/testing/w6-resume-frontend-compile-budget.json`:

- cold compile ceiling: 5,000 ms;
- incremental compile ceiling: 1,500 ms;
- raising either ceiling requires new source-bound evidence and independent performance review.

Root package scripts expose both measure and check commands. The check is required by
`.github/workflows/test-build.yml`. The existing API-1009 profile continues to use a separate
entrypoint, closure, budget, and externals.

## Whole-page frontend milestone remains open

The controlled Next 16.2.11/Turbopack journey currently records:

- cold compile traces: 17,808.8 ms and 17,057.0 ms;
- first valid Resume request: 19,768.8 ms, HTTP 200;
- warm requests: 166.8 ms and 134.4 ms;
- API-0282 facade cold compile: 230.6 ms.

That evidence is bound to the earlier `acd7c563...` source state and is deliberately not presented
as the final-source Vite measurement. It remains useful evidence that the whole-page cold journey
has not met the 10-second objective. A final-source successful whole-page incremental compile and
key interaction are still not recorded.

Under the current review policy, the three routes can receive functional approval because native
behavior, authorization, PostgreSQL isolation, focused browser closure, per-surface bundle
ratchets, and final-source raw cold/incremental measurements all pass. The historical 19.7688
second cold journey and missing final whole-page interaction measurement remain explicit blockers
for the separate frontend-performance milestone.

Do not report this route approval as completion of the overall frontend speed objective.

## Independent verification

Passing results:

```text
focused W6 API behavior/auth/method/boundary: 4 files, 36 tests
execution-read package contract: 1 file, 4 tests
focused Resume consumer/proxy/view-model: 4 files, 10 tests
disposable PostgreSQL 16: 1 file, 2 tests
W6 Vite check: 409 ms cold / 128 ms incremental
Vite ratchet unit tests: 2/2
entrypoint append/restore hash: exact match
lightweight client surfaces: passed
Resume page: 202,347 gzip bytes, 311 inputs, Lucide root barrel absent
browser runtime closure: passed, zero zero-budget violations
browser contract isolation: 200 bytes, no forbidden runtime leakage
```

The following stable full gates were run by the same independent reviewer against the same final
source state immediately before this W6 signature and are reused here:

```text
full API: 210 passed, 5 skipped
full API TypeScript: passed
full Sim TypeScript: passed
API production build: passed, 1,066 modules
W6 production module/adapters/routes: present in build output
strict API validation: 991/991 Zod-backed, 0 non-Zod
target structure: 57 module roots, 100 required files
```

The first root-level focused Sim invocation lacked the app's Vite alias configuration and failed
to resolve `@/` in two suites. Re-running the identical four files from `apps/sim`, which loads the
actual Sim Vitest configuration, passed 10/10. This was a reviewer command-context error, not a
source failure.

## Handoff

The owning/root agent may now change the independent-review status for API-0282, API-0996, and
API-0997 from `changes-required` to `approved` and add all three IDs to W6
`completedInventoryIds`.

Those ledger changes are intentionally outside this independent reviewer task.

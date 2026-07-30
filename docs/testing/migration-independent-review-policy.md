# Migration independent-review gate

## Purpose

A migrated API or feature is not accepted merely because it compiles or has a route entry. It is
counted in `api-wave-migration-progress.json` only after a reviewer who did not implement that
slice confirms that the donor behavior, security boundary, tests, and frontend dependency closure
are complete.

This gate applies to every migration completed after 2026-07-30. Earlier accepted slices will be
reviewed retrospectively in batches, but their historical status is not rewritten without evidence.

## Required implementation evidence

Every feature must have:

1. a native application implementation that owns the real behavior, not an empty handler,
   passthrough, mock-only adapter, or inventory-only manifest;
2. a versioned wire contract or protocol;
3. authentication, authorization, tenant isolation, and error-precedence tests;
4. donor/native differential evidence, or an explicit compatibility matrix when direct
   differential execution is impossible;
5. integration tests for every real I/O boundary: PostgreSQL, Redis, Object Storage, Worker RPC,
   provider API, or sandbox protocol as applicable;
6. browser and runtime boundary checks proving that Registry, Executor, Sandbox, credentials,
   encryption implementations, and server-only SDKs cannot enter the frontend closure;
7. a handoff document containing commands, results, known compatibility limits, and rollback
   scope.

## Independent reviewer checklist

The reviewer must inspect the implementation and donor code independently, then record:

- implementation author/agent and reviewer/agent are different;
- route methods, path parameters, query/body coercion, response wire shape, and status codes match;
- authentication and authorization execute in the donor-compatible order;
- all database and external-service filters preserve tenant isolation;
- no secret-bearing persistence field crosses the versioned response contract;
- fixed-query or bounded-query behavior replaces accidental N+1 reads where relevant;
- frontend imports only contracts and data-only metadata;
- focused tests, type-check, boundary checks, integration tests, and build evidence pass;
- every deviation is either fixed or explicitly approved as a versioned behavior change.

The review result is `approved`, `changes-required`, or `blocked`. Only `approved` may enter the
accepted route ledger.

## Frontend-performance acceptance

Functional correctness is necessary but not sufficient. Each migration wave must also preserve or
improve:

- browser dependency-closure counts for API/Worker, Registry, Executor, Sandbox, and Infra roots;
- browser bundle budgets for contracts and metadata catalogs;
- cold and incremental compile measurements for the affected frontend entry points;
- page-open and key-interaction latency measurements when an automated browser scenario exists.

Raw measurements are stored under `docs/testing/evidence/`; ratchets must fail on regression rather
than silently updating the baseline.

### Functional-route approval versus frontend milestone approval

The accepted API-route ledger and the frontend-performance milestone answer different questions:

- A route may receive **functional approval** when its native behavior, authorization, real-I/O
  integration, focused browser closure, bundle ratchet, and raw performance evidence all pass. A
  page-level cold-start target that is still unmet must remain visible, but it does not rewrite an
  otherwise-correct backend route as behaviorally incomplete.
- The frontend-performance milestone remains **blocked** until its cold compile, incremental
  compile, page-open, and key-interaction targets pass. Functional route approval must never be
  reported as completion of this milestone or of the overall frontend speed objective.
- Missing raw measurements, a silently raised budget, frontend heavy-runtime leakage, or a
  regressing bundle still blocks both approvals. Only an explicitly unmet page SLO may be tracked
  separately, and its evidence and owner must be recorded in the progress document.

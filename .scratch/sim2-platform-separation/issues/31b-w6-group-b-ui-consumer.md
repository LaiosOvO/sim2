# W6 Group B real UI consumer remediation

## Scope

- Review blocker only: `apps/sim/hooks/queries/execution-control.ts` has no real
  user-facing consumer.
- No donor edits, accepted-ledger edits, index changes, commits, or pushes.

## Findings

- `useJobStatus` and `useWorkflowExecutionStatus` are currently referenced only
  by their defining hook module.
- The user-facing paused-execution page already displays execution state and
  exposes a Refresh interaction:
  `apps/sim/app/(interfaces)/resume/[workflowId]/[executionId]/resume-page-client.tsx`.
- That page already has a reproducible browser-closure budget under the
  `resume-execution-page-client` surface. Connecting the focused hook there
  makes the existing page-level gate cover the real consumer instead of an
  isolated proposed surface.
- The hook currently polls forever, including after terminal states, and does
  not declare the explicit named `staleTime` required by the React Query
  conventions.

## Frozen design

- The paused-execution page consumes `useWorkflowExecutionStatus` directly.
- The focused response drives a visible overall-execution badge; the existing
  paused-detail response remains the source for pause-point form state.
- The existing Refresh button refetches both projections.
- Polling/stopping rules stay hidden inside the focused hook:
  pending/running/paused continue polling; completed/failed/cancelled stop.
- Tests exercise the visible status and Refresh interaction.
- Lightweight closure verification remains page-bound and rejects Executor,
  Sandbox, registries, DB, auth implementation, Redis, encryption, Feishu, and
  Meegle paths.

## Verification log

- Added the real import and consumer call in the paused-execution page.
- The visible `Overall execution status` badge is driven by the focused
  execution-control projection.
- The existing Refresh button awaits both the pause-detail refetch and focused
  status refetch.
- Polling now uses named constants, declares `staleTime`, and stops for terminal
  job/execution states.
- `resume-page-client.interaction.test.tsx`: 2/2 passed.
- Sim TypeScript check: passed.
- React Query pattern audit: passed with zero strict-zone violations.
- Client-boundary import audit: passed.
- API validation boundary audit: passed (`991/991` Zod-backed routes, no
  boundary-policy drift).
- Page-bound lightweight browser closure:
  `203,073` gzip bytes / `314` inputs under the `210,000` byte budget, with no
  heavy runtime leakage.
- The real-page budget now explicitly rejects background, queue, Redis, and
  server-auth implementation paths in addition to the repository-wide heavy
  runtime denylist.
- Isolated focused-hook closure remains:
  `83,133` gzip bytes / `104` inputs, with no heavy runtime leakage.
- W6 Group B focused Vite compile:
  `79 ms` cold / `31 ms` incremental against `5,000/1,500 ms`.
- Real paused-execution page Vite compile:
  `483 ms` cold / `227 ms` incremental against `5,000/1,500 ms`.

## Result

The review statement that both focused hooks occur only in their defining
module is no longer true. `useWorkflowExecutionStatus` is imported and invoked
by a real user-facing page, and the page's existing closure gate now traverses
the focused hook and contract.

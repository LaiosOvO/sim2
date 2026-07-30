# W2 native provider model discovery（9 routes）

## Outcome

API-0270/0271/0272/0273/0274/0275/0276/0278/0279 use one native Provider Model
Discovery deep module in `apps/api`. The nine original Next paths are API-only compatibility
facades. Independent re-review approved all nine functional routes on 2026-07-30, and they are now
present in `completedInventoryIds`. The overall Next page-performance milestone remains separate.

Sim2 and Polaris donor files are byte-identical for all nine routes. Route hashes and the
route-by-route behavior audit are tracked in
`.scratch/sim2-platform-separation/issues/27-w2-provider-model-discovery.md`.

## Frozen backend interface

```text
ProviderModelDiscoveryModule.handle
  -> DiscoverProviderModelsUseCase.execute
     -> BaseProviderModelCatalog.list
     -> ProviderModelCredentialReader.readAuthorized
     -> ProviderModelSource.read
```

The use case owns blacklist precedence, query validation, optional session enrichment,
BYOK/environment fallback, wire projection, model filtering/deduplication, and donor-compatible
error folding. PostgreSQL, AES, provider URLs, Authorization headers, timeout, response-size
limits, and caching stay behind adapters.

The four workspace-aware routes remain public. A nonempty `workspaceId` enables optional
session/permission/BYOK lookup; it does not require authentication. Ollama Cloud is BYOK-only.
Baseten, Fireworks, and Together may fall back to process environment keys.

## Browser boundary and loading policy

The final `ProviderModelsLoader` is the enforced browser entry. It imports only focused
provider-model queries/contracts, the provider data store, and a lightweight search-open
projection. It does not import `providers/utils.ts`, Registry, Executor, tools, sandbox, server
auth, database, encryption, or Node built-ins.

Demand-driven loading matches Polaris:

- workflow editor: base models only;
- integrations, custom-block settings, or open search: dynamic providers;
- unrelated workspace routes: no provider-model query is mounted.

Latest browser gate: final loader `70,871` gzip bytes; nine Next facades, largest `1,019` gzip
bytes. Six loader tests and five search-store projection tests freeze the policy.

## Compatibility corrections

- Base catalog generation reads both donor sources: model definitions and explicit provider
  iteration order. It contains 202 entries with definition hash
  `ac49fea5cb184200a951a3189dd90f1656f93ff69831f3077ea36aac1fdf7225` and order hash
  `f3b937dac5381487919a7442658dcc3df14f975957b0221340489ca22e6987cd`.
- Differential parity checks the complete ordered response and last-provider-wins ownership:
  202/202 ordered IDs, zero owner mismatch.
- LiteLLM, vLLM, and Ollama preserve 60-second caching, including LiteLLM/vLLM requests that use
  process environment keys. OpenRouter preserves 300 seconds.
- Baseten, Fireworks, Ollama Cloud, and Together remain no-store because their provider TTL is
  zero, including workspace BYOK traffic.
- Optional provider URL validation occurs per read. Malformed URLs do not fail production
  composition or unrelated routes; the affected discovery route returns the donor-compatible
  empty 200 wire.
- External reads accept only HTTP(S), have bounded timeout and response size, reject redirects,
  and fold timeout/oversize/non-2xx/network/schema failures to the compatible empty wire.

## Performance evidence

The source-bound Vite watch runner compiles the actual loader, appends a valid TSDoc probe to that
entry, waits for the incremental bundle, restores the exact original bytes, and verifies the
restored hash. It records Bun/Vite/platform/CPU metadata, measurement-tool hash, and hashes for the
focused source closure.

Committed files:

- `docs/testing/evidence/w2-provider-model-discovery-frontend-compile-raw.json`
- `docs/testing/w2-provider-model-discovery-frontend-compile-budget.json`

Current source-bound sample: cold `81 ms`, incremental `35 ms`. Fixed ceilings are `2,500 ms`
and `750 ms`. The raw artifact is regenerated after any formatting before handoff.

## Verification commands

```powershell
bunx vitest run packages/api-contracts/tests/provider-model-discovery.test.ts
cd apps/api
bun run test -- tests/w2/native-provider-model-discovery.test.ts tests/w2/native-provider-model-discovery.http.test.ts
bun run test -- tests/w2/native-provider-model-discovery.postgres.test.ts
bunx tsc --noEmit
bun run build
cd ../sim
bunx vitest run "app/workspace/[workspaceId]/providers/provider-models-loader.test.tsx" stores/modals/search/store.test.ts lib/api-proxy/provider-model-discovery.test.ts
cd ../..
bun run check:provider-model-discovery-coverage
bun run check:provider-model-discovery-boundary
bun run check:provider-model-discovery-client
bun run check:provider-model-discovery-client-types
bun run provider-model-catalog:check
bun run check:provider-model-catalog-parity
bun run check:provider-model-discovery-compile
bun run check:api-validation:strict
bun run check:browser-runtime-closure
```

CI now runs coverage, module boundary, final-loader browser/type checks, catalog freshness/parity,
and source-bound compile ratchets.

Latest verification:

- loader/search/proxy: 14/14;
- application + HTTP: 18/18;
- contract and architecture units: 8/8;
- disposable PostgreSQL 16.14: 1/1, temporary container removed;
- full API: 212 passed, 5 skipped;
- all API contracts: 27/27;
- API type/build: pass, 1,066 modules;
- full Sim type check: pass;
- strict API validation: 991/991;
- lightweight surfaces and browser-runtime closure: pass;
- raw compile source/tool hashes: 12/12 match current files.

## Review status

Status: `pending-independent-re-review`.

The original independent reviewer implemented the required corrections and therefore cannot
approve this slice. A different reviewer must recompute compile/tool/source hashes, rerun focused
and full suites plus the disposable PostgreSQL fixture, and verify every original blocking finding
before changing the result or accepted ledger.

## Final narrow-blocker remediation

The last method/cache/configuration review findings are implemented:

- Exact matched-route method policy is `GET, HEAD, OPTIONS`.
- `HEAD` crosses the same query validation, optional authentication, credential lookup, use case,
  and upstream handler path as `GET`, then suppresses the response body while retaining status and
  observation headers.
- `OPTIONS` returns 204 with exact `Allow: GET, HEAD, OPTIONS` and does not execute auth/use case.
- POST/PUT/PATCH/DELETE on a matched provider route return 405 without an `Allow` header, matching
  the donor/Next response; unrelated paths remain application-level 404 for GET/HEAD/OPTIONS and
  unsupported methods.
- The committed environment-key TTL test is parameterized for both LiteLLM and vLLM. Both reuse
  the first response inside 60 seconds and refetch after expiry.
- Production liveness now parameterizes invalid `OLLAMA_URL`, `LITELLM_BASE_URL`, and
  `VLLM_BASE_URL` as three independent compositions. Each affected provider folds to
  `200 {models:[]}`, liveness stays 200, and no invalid endpoint reaches fetch.

Verification after this remediation:

- focused application + HTTP: 21/21;
- full API: 228 passed, 6 skipped;
- provider contracts: 3/3;
- provider coverage and module boundary: pass;
- strict API validation: 991/991;
- focused provider client TypeScript: pass;
- full API TypeScript: pass;
- API production build: pass, 1,074 modules.

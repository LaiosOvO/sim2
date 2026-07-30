# W2 Provider Model Discovery independent re-review

Result: **approved**

Routes:

- API-0270 `GET /api/providers/base/models`
- API-0271 `GET /api/providers/baseten/models`
- API-0272 `GET /api/providers/fireworks/models`
- API-0273 `GET /api/providers/litellm/models`
- API-0274 `GET /api/providers/ollama-cloud/models`
- API-0275 `GET /api/providers/ollama/models`
- API-0276 `GET /api/providers/openrouter/models`
- API-0278 `GET /api/providers/together/models`
- API-0279 `GET /api/providers/vllm/models`

Implementation agent: `/root/api1032_donor_audit`

Previous reviewer/remediation author: `/root/api_provider_models_review`

Independent re-reviewer: `/root/provider_discovery_independent_rereview`

Review date: 2026-07-30

The re-reviewer did not implement this slice, did not modify the accepted-route ledger or Git
index, and compared the read-only Sim2 and Polaris donors directly. All six substantive findings
from the previous review are fixed. The final cache and invalid-URL test gaps are also closed. The
last exact `Allow` header mismatch is fixed. Focused 21/21, full API 228/228, and API type-check
pass on the final source.

## Final method blocker closed

### GET/HEAD/OPTIONS/405 and unrelated-path parity

Closed. The final implementation and committed test matrix now match the Next 16 GET-only route
interface:

- GET executes discovery and returns the versioned wire;
- HEAD executes the same discovery/authentication behavior and suppresses the body;
- OPTIONS returns 204 with `Allow: GET, HEAD, OPTIONS`;
- POST/PUT/PATCH/DELETE return 405 without `Allow`;
- OPTIONS and unsupported methods do not execute discovery or authentication;
- unrelated paths remain 404 for every tested method and do not receive inventory or `Allow`
  headers.

The exact method test passed 1/1, the complete focused application/HTTP set passed 21/21, and API
type-check passed after the final source change.

## Final narrow blockers closed

### LiteLLM and vLLM environment-key cache coverage

Closed. `apps/api/tests/w2/native-provider-model-discovery.http.test.ts:78` parameterizes the
60-second TTL over both `litellm` and `vllm`, checks the Authorization header, advances the clock
60,001 ms, and retains a Baseten workspace-key no-store test. Both cases pass.

### Ollama, LiteLLM, and vLLM invalid-URL production liveness

Closed. `apps/api/tests/w2/native-provider-model-discovery.test.ts:513` parameterizes invalid
`OLLAMA_URL`, `LITELLM_BASE_URL`, and `VLLM_BASE_URL`. Each case crosses production composition,
proves `/internal/live` remains 200, proves the affected native provider route returns
`200 {"models":[]}`, and proves upstream fetch count remains zero. All three cases pass.

## Previous blockers now resolved

| Previous finding | Independent re-review |
| --- | --- |
| Real loader reached `providers/utils`, Executor, registry and `node:crypto` | Resolved. A Vite module-graph probe found 104 modules and zero matches for `providers/utils`, Executor, Registry, Sandbox, or `node:crypto`. The enforced Bun browser build succeeds at 70,871 gzip bytes. |
| Polaris lazy loading was missing | Resolved. Workflow editor mounts base only; search, integrations, and custom-block settings mount dynamic providers; unrelated workspace routes mount no queries. Loader/search/proxy tests pass 14/14. |
| No source-bound cold/incremental evidence or CI ratchet | Resolved. Raw evidence is bound to the actual `ProviderModelsLoader`; all 12 tool/source SHA-256 values match current files. The committed sample is 81 ms cold / 35 ms incremental; independent live check was 128 ms / 35 ms against 2,500/750 ms ceilings. CI invokes the boundary, catalog, real-loader/type, architecture and compile ratchets. |
| LiteLLM/vLLM process keys disabled donor TTL | Resolved. Both use 60 seconds and both are committed integration cases; workspace-key providers remain zero TTL. |
| Invalid optional URL could prevent all API composition | Resolved. Validation/folding occurs per read and production liveness is committed for Ollama, LiteLLM, and vLLM independently. |
| Generated base catalog changed response order | Resolved. Differential check passes 202/202 ordered models with zero final-owner mismatches. |
| Deleted donor route suites were not equivalently replaced | Resolved through the deep module interface, real HTTP adapter, real PostgreSQL adapter, production composition, browser loader, proxy and catalog differential tests. |

## Donor and contract review

The nine Sim2 and Polaris route implementations are byte-identical. Their donor hashes remain:

| ID | Provider | SHA-256 |
| --- | --- | --- |
| API-0270 | base | `1F160C5FF93C065C7DEBF69BCB575DCBB763E31BC2C3729AFC83EACAE8D56526` |
| API-0271 | baseten | `F99AA9DB29ADD3C218B263FB44A881CBDAD2C7E4B8D4944D909B514FDA8A332F` |
| API-0272 | fireworks | `8E3DF191D41E92E5DBD99E5CE2CFAEACFDA7C03BF96741452C7AECC49F3CF6BD` |
| API-0273 | litellm | `67D465AF716B60618D1C095DB79685F7DFF60F29DAED322594B0366A8376D9C3` |
| API-0274 | ollama-cloud | `AD4E035535488D011A60C2C37C51BAF38CC3545ECBFBCF10432574CA2B2768C7` |
| API-0275 | ollama | `6896AEF7AD8CCFFFBCAFB790B9FBF1885F5099F73C8DE1AE6E7916F82EC86B8C` |
| API-0276 | openrouter | `F905CBFBA1E50264DC8E1C01D77CE56D9939CD43F726E54CF37C66041891823C` |
| API-0278 | together | `6FB192D30610E5CE2DE0D3A939C8E88BE6DC49DF08846B49AA2C85BED0BC3783` |
| API-0279 | vllm | `3046215CAE105EB579A8DE0696D9617F362356D927E079C80FEE3376A16D05A7` |

Verified compatible behavior:

- provider blacklist precedes query validation, authentication, credential reads and upstream I/O;
- workspace query coercion and empty-value 400 behavior match;
- public/optional-session behavior, permission-first BYOK lookup and environment fallback match;
- Ollama Cloud remains BYOK-only;
- real PostgreSQL authorization isolates workspace/provider rows before decryption;
- no credential or encrypted field crosses the versioned response wire;
- remote URL/header projection, dedupe policy, Together chat filtering and OpenRouter metadata match;
- non-2xx, network, malformed schema, timeout and response-size failures fold to compatible empty
  wires;
- the base catalog returns all 202 models in donor order with last-provider-wins ownership;
- all nine production-composed paths are native and do not require a legacy origin;
- unrelated paths fall through without invoking the discovery use case.

Approved explicit hardening: redirects are rejected rather than followed. This keeps provider
reads at the configured HTTP(S) endpoint and avoids redirect-based endpoint expansion. It is a
deliberate versioned security change, not an accidental parity claim.

## Deep-module assessment

The migration now forms a deep module:

```text
ProviderModelDiscoveryModule.handle
  -> DiscoverProviderModelsUseCase.execute
     -> BaseProviderModelCatalog
     -> ProviderModelCredentialReader
     -> ProviderModelSource
```

The external interface is small while blacklist precedence, optional-session enrichment, BYOK
selection, provider-specific projection, caching and error folding remain local to the
implementation. The generated catalog, Drizzle reader and HTTP source are real adapters at
justified seams; tests cross the same application interface used by production. The browser uses a
separate data-only seam and no longer imports the server/runtime implementation.

## Independent command evidence

| Gate | Result |
| --- | --- |
| Provider contracts | 3/3 passed |
| Focused application + HTTP | 21/21 passed |
| Loader/search/proxy | 14/14 passed |
| Architecture negative fixtures | 5/5 passed |
| Disposable PostgreSQL | PostgreSQL 16.14, 1/1 passed; exact temporary container removed |
| Full API | 34 files passed, 5 skipped; 228 passed, 6 skipped |
| All API contracts | 4 files, 27/27 passed |
| API type-check | passed |
| API production build | passed, 1,066 modules |
| Full Sim type-check | passed |
| Strict API validation | 991/991 Zod-backed, zero drift |
| Provider coverage/boundary | 9/9 and 6 module files passed |
| Real loader browser bundle | 70,871 gzip bytes; no forbidden runtime closure |
| Nine Next facades | largest 1,019 gzip bytes |
| Base catalog differential | 202 ordered models, owner parity passed |
| Raw evidence hashes | 12/12 match current source/tool files |
| Focused compile ratchet | live 128 ms cold / 35 ms incremental; 2,500/750 ms ceilings |
| Global browser closure | ratchet passed; zero-budget violations empty |
| Lightweight client surfaces | ratchet passed |
| Diff whitespace check | passed |

## Next page performance remains a separate milestone

This result must not be presented as completion of the overall frontend-speed objective.

The provider slice now has a real-loader source-bound compile ratchet and no provider/runtime leak.
It does not have an automated full Next workspace-page cold start, page-open, or key-interaction
journey. Repository evidence still shows whole-page Next cold journeys above the 10-second target
(the Resume journey is approximately 17-18 seconds). Existing global browser-closure counts also
remain nonzero in unrelated client roots even though this loader's focused closure is clean.

Therefore:

- the nine provider route migrations are functionally approved;
- the overall Next/frontend performance milestone remains separately blocked until page-level cold,
  incremental, open and interaction targets pass.

## Approval decision

API-0270/0271/0272/0273/0274/0275/0276/0278/0279 satisfy the independent functional-route gate.
The integration owner may update the accepted-route ledger after its normal final source-state and
checkpoint verification. This reviewer did not modify the ledger, Git index, commit, or remote.

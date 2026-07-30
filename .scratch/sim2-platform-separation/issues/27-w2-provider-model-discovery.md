# W2 Provider Model Discovery 9 路审计与实现追踪

范围：

- API-0270 `GET /api/providers/base/models`
- API-0271 `GET /api/providers/baseten/models`
- API-0272 `GET /api/providers/fireworks/models`
- API-0273 `GET /api/providers/litellm/models`
- API-0274 `GET /api/providers/ollama-cloud/models`
- API-0275 `GET /api/providers/ollama/models`
- API-0276 `GET /api/providers/openrouter/models`
- API-0278 `GET /api/providers/together/models`
- API-0279 `GET /api/providers/vllm/models`

状态：native 深模块、真实适配器、9 个 facade 与边界门禁已完成；9 路统一处于
`pending-independent-review`，实现者未修改 accepted ledger。

## Donor 同源结论

Sim2 与 Polaris 的 9 个 route 文件逐字相同：

| ID | Provider | SHA-256（两 donor 相同） |
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

因此没有 Polaris-only wire 分叉；一套差分矩阵覆盖两 donor。

## 逐路行为矩阵

| ID | Auth / workspace | 环境与凭据优先级 | Upstream 与缓存 | 成功投影 | 失败语义 |
| --- | --- | --- | --- | --- | --- |
| 0270 base | public | 无 secret；从 provider definitions 取静态模型 | 无外部 HTTP | base provider model IDs，应用 provider/model blacklist | catalog/contract 异常时 `500 {models:[],error:"Failed to fetch models"}` |
| 0271 baseten | public；有 `workspaceId` 时尝试 session + 任意有效 workspace permission | authorized BYOK > `BASETEN_API_KEY`；都无则空 | `https://inference.baseten.co/v1/models`；`no-store` | `baseten/${id}`，去重后 blacklist | validation 400；无 key、non-2xx、network、schema error 都 `200 {models:[]}` |
| 0272 fireworks | 同 baseten | authorized BYOK > `FIREWORKS_API_KEY` | `https://api.fireworks.ai/inference/v1/models`；`no-store` | `fireworks/${id}`，去重后 blacklist | 同 baseten |
| 0273 litellm | public | `LITELLM_BASE_URL` 必须有；可选 `LITELLM_API_KEY` | `${base}/v1/models`；60 秒 revalidate | `litellm/${id}`，不显式去重，blacklist | 未配置、non-2xx、network、schema error 都 200 空 |
| 0274 ollama-cloud | public；有 `workspaceId` 时尝试 session + permission | 仅 authorized BYOK；绝不回退 hosted env key | `https://ollama.com/api/tags`；`no-store` | `ollama-cloud/${name}`，去重后 blacklist | validation 400；无 key与所有 upstream 失败均 200 空 |
| 0275 ollama | public | `OLLAMA_URL`，默认 `http://localhost:11434`；无 key | `${base}/api/tags`；60 秒 revalidate | 原始 `name`，不显式去重，blacklist | 所有 upstream 失败均 200 空 |
| 0276 openrouter | public | 无 key | `https://openrouter.ai/api/v1/models`；300 秒 revalidate | 去重的 `openrouter/${id}` + modelInfo；pricing 转为每百万 token | blacklist/provider disabled 返回 `{models:[],modelInfo:{}}`；upstream 失败同形 200 |
| 0278 together | public；有 `workspaceId` 时尝试 session + permission | authorized BYOK > `TOGETHER_API_KEY` | `https://api.together.ai/v1/models`；`no-store` | 排除 image/video/audio/transcribe/embedding/moderation/rerank；`together/${id}` 去重+blacklist | validation 400；其余失败 200 空 |
| 0279 vllm | public | `VLLM_BASE_URL` 必须有；可选 `VLLM_API_KEY` | `${base}/v1/models`；60 秒 revalidate | `vllm/${id}`，不显式去重，blacklist | 未配置与 upstream 失败均 200 空 |

## Auth 与错误顺序

四条 workspace-aware route（baseten/fireworks/ollama-cloud/together）的 donor 顺序：

```text
provider blacklist
  -> workspaceId query validation
  -> optional session lookup
  -> permission lookup
  -> BYOK lookup/decrypt
  -> provider-specific env fallback
  -> external HTTP
  -> upstream schema + response projection
```

它们不是“强制 session”接口。匿名请求合法：三条 hosted provider 可以使用服务器环境 key，
Ollama Cloud 则返回空数组。inventory 中的 `Session/Middleware` 只能理解为 optional BYOK
enrichment，不能在 native module 中错误地改成 401。

`workspaceId=` 是 400；provider 已整体 blacklist 时先返回 200 空，不触发 validation、auth、
DB 或 HTTP。无权限的 session 不读取 BYOK，并按 provider 规则回退 env key或空。

## Wire 与过滤细节

- 通用响应为 `{models: string[], modelInfo?: Record<string, OpenRouterModelInfo>}`。
- unknown response 字段由 Zod 剥离；credential、Authorization、upstream error body 不进入 wire。
- provider blacklist 大小写不敏感，逗号分隔并 trim。
- model blacklist 大小写不敏感，支持 exact 与尾部 `*` prefix。
- OpenRouter `modelInfo` 在 model blacklist 前构建；donor 会保留被 blacklist model 的 info，
  native V1 为差分兼容保留该行为。
- LiteLLM/vLLM/Ollama 不显式去重；其余远端 provider 按首次出现顺序去重。

## 当前边界问题

1. 旧 `apps/sim/lib/api/contracts/providers.ts` 同时包含 9 条 model discovery、upstream
   schema、以及 provider execution 请求/响应协议；实际 React Query hook 因此打开了不相关
   provider execution contract。
2. base route 通过 `providers/utils.ts` 间接拖入 provider definitions、UI icons、stores、
   executor/tool/workflow utilities。只为静态 model IDs 加载该图是不合格的 seam。
3. 9 条 route 各自重复 env、BYOK、fetch、error folding、blacklist 与 projection。
4. donor 没有显式 HTTP timeout 或响应体上限；慢/恶意 upstream 可长期占用连接或内存。
5. Next `revalidate` 是隐式缓存语义；迁到独立 API 后必须由 adapter 显式拥有 TTL。

## 冻结的深模块

外部 Interface 只有一个 HTTP Module：

```text
ProviderModelDiscoveryModule.handle(request, requestContext)
```

内部可替换 seam：

```text
DiscoverProviderModelsUseCase.execute
  -> ProviderModelSource.read          # true external HTTP adapter / fake
  -> ProviderModelCredentialReader     # PostgreSQL + permission + decrypt / fake
  -> BaseProviderModelCatalog.list     # generated data-only adapter / fake
```

HTTP adapter 隐藏 provider URL、header、timeout、响应上限和 0/60/300 秒缓存；application
隐藏顺序、credential fallback、schema、dedupe/filter 和错误折叠。调用方不能接触 secret。

## 安全加固（明确的兼容性改进）

在保持 wire/status 的前提下增加：

- 每个 external request 的 bounded timeout；
- streaming response byte limit，超限取消读取并折叠为 donor-compatible 200 空；
- 仅允许 production 配置使用 `http:`/`https:` URL；
- cache key 不含 secret，且所有 credential-bearing provider 固定 `no-store`；
- log、response、error details 永不包含 Authorization/API key；
- BYOK 只有 session actor 对 active workspace 具有有效 permission 时才解密。

## 验收追踪

- [x] focused V1 contracts + compatibility tests
- [x] generated base model catalog 与 donor source hash/check
- [x] application/interface/ports
- [x] bounded/cached HTTP adapter + local HTTP integration
- [x] PostgreSQL BYOK + permission + AES adapter/integration（无 disposable DSN 时自动 skip）
- [x] 9 路 differential/auth/validation/error tests
- [x] production composition + API routing/observation headers
- [x] 9 个 API-only lightweight Next facade
- [x] actual React Query hook 切到 focused contract
- [x] browser closure、focused type-check、API production build
- [x] module alignment、inventory、handoff 与 pending-independent-review

## 实现结果

- Next facade 从 schema-bearing contract 进一步拆到
  `@sim/api-contracts/provider-model-discovery-routes` 纯路由 metadata subpath；9 个 facade
  单体最大仅 `1,019` gzip bytes。
- 实际 provider query hook 不再导入旧 `lib/api/contracts/providers.ts` 大合同；focused
  browser build 为 `69,929` gzip bytes，且不包含 Registry、Executor、Sandbox、DB、
  server auth/crypto 或 BYOK 表标记。
- 外部 HTTP adapter 实测覆盖 secret-free TTL、secret-bearing no-store、Authorization
  header、non-2xx、100ms timeout、1KiB response limit 与非法 URL。
- PostgreSQL fixture 只在显式 disposable 数据库开关下执行；本机无 DSN 的普通测试会
  skip，不能把 skip 误报为真实数据库已在当前机器执行。
- 独立验收登记位于 `docs/testing/api-wave-migration-progress.json`；9 路均未加入
  `completedInventoryIds`。

## 2026-07-30 changes-required remediation

Independent review found that the backend deep module was sound, but the final browser consumer
still imported `providers/utils.ts`, mounted all nine queries unconditionally, and had no
source-bound compile ratchet. It also found LiteLLM/vLLM TTL drift, eager optional-URL validation,
and base-catalog order drift.

Remediation now implemented:

- `ProviderModelsLoader` depends only on focused query/contracts, the provider data store, and a
  lightweight search-open projection. It no longer reaches Executor, Registry, tools, auth,
  encryption, database, or Node built-ins through `providers/utils.ts`.
- Loading is demand-driven: workflow editor loads base; integrations/custom-block settings/open
  search load dynamic providers; unrelated workspace pages load none.
- The real loader browser closure is enforced at `70,871` gzip bytes and all nine API facades
  remain at or below `1,019` gzip bytes.
- A real Vite watch runner records cold and incremental compilation of the final loader, exact
  source/tool hashes, append/restore hashes, and fixed non-regression ceilings.
- LiteLLM/vLLM environment-key traffic retains 60-second caching. BYOK provider traffic remains
  no-store because those providers have zero TTL.
- Invalid optional provider URLs are isolated to the affected read and fold to the empty 200 wire;
  production liveness remains available.
- Generated base catalog order follows the donor's explicit provider iteration order. Differential
  parity is 202 ordered IDs with zero owner-map differences.
- Production composition, wrong-method, unrelated-path, invalid-session, env fallback, loader
  gating, cache, invalid URL, and catalog-order replacements cover the deleted route suites.

Status remains `pending-independent-re-review`. The remediation implementer cannot approve the
slice and did not edit the accepted-route ledger.

## Final HTTP parity/cache/configuration remediation

- Matched paths now implement the Next-compatible method matrix: GET; HEAD through the full GET
  handler/auth path with an empty response body; OPTIONS 204; and 405 for
  POST/PUT/PATCH/DELETE. OPTIONS and 405 return exact
  `Allow: GET, HEAD, OPTIONS`. Unrelated paths remain 404 under every tested method.
- The 60-second environment-key cache contract is parameterized and committed for both LiteLLM
  and vLLM.
- Invalid Ollama, LiteLLM, and vLLM URLs are covered as three independent production-composition
  cases. Liveness remains available, each affected route returns an empty 200 wire, and fetch is
  not called.
- Focused provider application + HTTP tests pass 21/21.
- Full API passes 228 tests with 6 environment-gated skips; provider contract 3/3, coverage,
  module boundary, strict validation 991/991, focused client TypeScript, and the 1,074-module API
  production build pass.
- Full API TypeScript currently has one unrelated concurrent W6 fixture error at
  `tests/w6/execution-control-module.test.ts:115` (missing required `output`); no provider file is
  reported and this slice does not modify that W6 test.

Status remains `pending-independent-re-review`; accepted-route ledger/index are unchanged.

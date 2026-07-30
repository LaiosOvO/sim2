# W4 A–L 生成器与兼容层实现 checkpoint

## 结论

本 checkpoint 已实现 W4 A–L 的可执行迁移底座，但按照“每个计入功能都必须有真实 provider 行为、鉴权、adapter integration 与测试证据”的严格口径，**本次不把 340 条 manifest 记录为已完成路由**。

已完成的是：

- 从 `docs/architecture/api-migration-inventory.md` 确定性生成 W4 A–L 的 340 条 data-only route descriptor。
- 精确覆盖批次：A–B 77、C–D 124、E–H 47、I–L 92，共 340 条、55 个 provider。
- 每条 descriptor 绑定 inventory ID、method、path、auth 分类、依赖、测试代码、provider rollout key 和实际存在的 legacy handler source。
- 静态扫描 tool source 后，304 条 descriptor 找到 runtime tool ID；36 条仍需 provider 专用 adapter 显式绑定，不能依赖启发式猜测。
- API 兼容层完成路由匹配、鉴权先行、请求体上限、请求/响应 header allowlist、浏览器 credential 隔离、idempotency 透传、provider 级 rollout、错误收敛。
- HTTP legacy adapter 能把请求发送到旧 Web 服务，不导入 Next route、tool registry、executor、sandbox 或 provider SDK。

## 深模块边界

`createToolRouteCompatibilityHandler` 是 API 层的单一深接口。调用方只提供：

- `ToolRouteAccess`：按 descriptor 做 session/internal-hybrid 鉴权，并可生成受信的上游鉴权证明；
- `ToolRouteRollout`：按 `tool-adapter:<provider>` 决定 native 或 fallback；
- `ProviderToolRouteAdapterRegistry`：解析 native 或 fallback provider adapter。

handler 内部隐藏路由表、鉴权顺序、body 限制、header 清洗、错误映射和 HTTP response 组装。Provider adapter 只接收经过清洗的 transport envelope 与独立 principal，不接触浏览器原始 cookie/authorization header。

这条边界直接服务于前端提速目标：API 模块的 import closure 不包含 Next、Sim UI、tool registry、executor 或 sandbox，前端只消费 HTTP contract，不再为读取 metadata 编译 provider/runtime 实现。

## 严格完成口径

manifest coverage、通用 handler 测试和 legacy transport 测试只证明“可承载”，不证明 endpoint 的 provider 语义已经迁移。某条路由只有同时具备以下证据才能计入严格账本：

1. 真实 provider adapter 或受控 legacy fallback 已在生产 composition 中绑定；
2. descriptor 所要求的 C/A/D/I/S/R/B 测试全部通过；
3. auth 分类与 donor 一致，并覆盖未登录、无权限、跨 workspace；
4. 参数、分页/流/文件、状态码和错误映射通过 donor differential test；
5. provider failure、idempotency 和 credential 泄漏测试通过；
6. API/Web 构建边界证明未静态加载 provider SDK、registry、executor、sandbox；
7. provider rollout 与 rollback 有集成证据。

因此本 checkpoint 的严格 completed-route count 是 **0**，foundation coverage 是 **340/340**。

## 当前证据

执行结果：

```text
bun run scripts/api/generate-w4-tool-adapters.ts --check
Verified 340 W4 A-L route descriptors

bun run --cwd apps/api test -- tests/w4
Test Files 4 passed
Tests 9 passed

bun run --cwd apps/api type-check
passed
```

focused tests 已覆盖：

- 340 条 method/path 进入 compatibility adapter；
- manifest 唯一性与四批精确数量；
- 鉴权拒绝发生在 adapter resolve/invoke 之前；
- browser cookie/authorization 不进入 adapter；
- idempotency、request ID 与受信 upstream auth proof 透传；
- provider 级 rollback 选择 fallback；
- 413、405、501、503 安全错误映射；
- HTTP legacy adapter 的 method/path/query/body/auth proof 与响应 header 行为；
- API tool-adapter 模块的禁止 import 扫描。

## 仍需主代理集成

本 checkpoint 遵守并发约束，没有修改 shared `package.json`、production composition 或总账本。主代理需要：

1. 在 API composition 中装配现有 request authenticator 到 `ToolRouteAccess`，不能直接信任客户端 principal header。
2. 配置仅内网可达的 legacy Web base URL；fallback registry 可先将 55 个 provider 指向共享 `HttpLegacyToolRouteAdapter`。
3. 把 compatibility handler 接入 API router 的 `/api/tools/*` 分支；未命中时继续现有 router。
4. 接入 provider 级 feature flag/rollout store。
5. 按 provider 实现 native adapter，并把 Worker 执行型动作交给 lazy runtime；API 不导入 Worker registry。
6. 对 36 条缺少 runtime tool ID 的路由逐条做 donor 语义审计，禁止生成器猜 ID。
7. 每完成一个 provider，运行 donor differential/integration/security 矩阵，再由独立 reviewer 更新严格账本。

## 文件

- `scripts/api/generate-w4-tool-adapters.ts`
- `apps/api/src/modules/tool-adapters/contracts.ts`
- `apps/api/src/modules/tool-adapters/route-table.ts`
- `apps/api/src/modules/tool-adapters/compatibility-handler.ts`
- `apps/api/src/modules/tool-adapters/http-legacy-tool-route-adapter.ts`
- `apps/api/src/modules/tool-adapters/manifest-validation.ts`
- `apps/api/src/modules/tool-adapters/generated/w4-tool-route-manifest.ts`
- `apps/api/tests/w4/*`

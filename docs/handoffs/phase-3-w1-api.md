# Phase 3 W1 独立 API 检查点

> 日期：2026-07-30
> Ticket：07 completed

## Inventory 完整性

| Inventory | Method | Path | API owner | Next facade |
| --- | --- | --- | --- | --- |
| API-0102 | GET, POST | `/api/environment` | Environment Module | 原路径 proxy |
| API-0127 | GET | `/api/health` | System Module | 原路径 proxy |
| API-0295 | GET | `/api/status` | Status Module | 原路径 proxy |

`docs/testing/api-w1-route-coverage.json` 将 3/3 路径绑定到 Contract、Differential、
Integration、Performance 证据；CI 从 1,126 路径 inventory 重新抽取 W1 行做一致性检查。

## 独立 API

- Runtime：Node.js 22.19+；
- 默认端口：3002；
- Liveness：`/api/health`、`/internal/live`；
- Readiness：`/internal/ready`；
- Version：`/internal/version`；
- Request headers：`x-request-id`、`x-api-contract-version`。

缺少 DB/Auth/Encryption 配置时，API 仍可启动并提供 liveness，readiness 返回 503；
environment 返回 503。配置完整后才动态加载 DB、Better Auth、AES cipher、credential
sync 与 Audit adapters。

## Environment seam

Environment application 只认识：

- `EnvironmentSessionResolver`
- `EnvironmentRepository`
- `EnvironmentSecretCipher`
- `PersonalEnvironmentCredentialSync`
- `EnvironmentAuditSink`
- `EnvironmentEventSink`

生产实现继续读取 Better Auth session cookie，保持原环境变量 AES-256-GCM 格式、Drizzle
upsert、个人 env credential/membership 同步、audit 和 `environment_updated` PostHog
事件。PostHog SDK 仅在启用 telemetry 后动态加载，并在 API 收到退出信号时 flush。
GET/POST 的旧 status/body 保持兼容；请求体不会接受明文 credential 之外的隐藏服务对象。

## Next 兼容代理与回滚

三个原 Route 只 import `proxyW1Request`。配置包括：

- `SIM_API_W1_ENVIRONMENT_MODE=api|legacy|off`
- `SIM_API_W1_HEALTH_MODE=api|legacy|off`
- `SIM_API_W1_STATUS_MODE=api|legacy|off`
- `SIM_API_BASE_URL`
- `SIM_LEGACY_API_BASE_URL`
- `SIM_API_PROXY_TIMEOUT_MS`
- `SIM_API_PROXY_FALLBACK_LEGACY=true|false`

代理透传 cookie、body、query 和 request ID；API transport 失败时可回退到远端旧部署。
不在 Next 内动态 import 旧实现，因此回滚不会重新污染 Web 编译图。

## 性能与构建

| 指标 | 结果 | 预算 |
| --- | ---: | ---: |
| Next W1 facade 最大 gzip | 1,244 bytes | 32 KiB |
| API split-build startup entry | 17.37 KiB | — |
| Node cold start | 1,978.91 ms | 5,000 ms |
| Node RSS | 213.7 MiB | 384 MiB |
| Node heap used | 81.4 MiB | 192 MiB |

性能原始记录在 `docs/testing/api-w1-performance-baseline.json`。

## 验证

| Gate | 结果 |
| --- | --- |
| W1 inventory coverage | 3/3，C/D/I/P 齐全 |
| API tests | 10/10 |
| API contract tests | 3/3 |
| Next proxy tests | 3/3 |
| Logger tests | 25/25 |
| API/auth/contracts type-check | 通过 |
| W1 facade/proxy type graph | 通过 |
| API split build | 通过 |
| Standalone Node API | health 200、unconfigured ready 503 |
| Contract generation | 21 schemas，clean tree |

全 Sim type-check 的最终复核被系统以 `-1` 终止且没有诊断；只读进程证据显示 Polaris Next
占约 6.9 GiB。W1 专用 type-check 与定向测试通过，但这里明确不声称全量检查成功。Next
冷 build 仍受既有外部执行条件限制。

## 下一步

Ticket 08 建立 Worker job/Sandbox skeleton，把 admission、queue、lease、timeout、cancel
与 Node isolated-vm adapter 串起来；W1 API 不 import Sandbox。

# 独立 API 骨架与 W1 三接口

What to build: 建立独立 TypeScript API 进程、兼容代理与 W1 的 3 个探针接口。
Blocked by: 04
Status: completed

## What to build

实现启动/关闭、配置、日志、request ID、错误 envelope、健康与环境探针；Next 保留同路径兼容门面。

## Acceptance criteria

- Inventory 中 `Wave = W1` 的精确 3 条全部生成 route coverage 记录。
- 独立 API 可单独启动并通过 readiness/liveness；Next Web 不必编译 route 实现即可访问。
- 新旧 wire contract/status/header differential test 通过。
- 反向代理支持逐路由开关、超时、回滚和 request ID 透传。
- W1 的 C/D/I/P 测试以及 API 冷启动/内存基线通过。

## Blocked by

04。

## Implementation evidence

- Inventory 的 W1 精确覆盖 `API-0102 /api/environment`、`API-0127 /api/health`、
  `API-0295 /api/status` 共 3 条；`api-w1-route-coverage.json` 和 CI 检查保证没有漏项；
- 独立 API 提供 `/api/health`、`/internal/live`、`/internal/ready`、
  `/internal/version`；无生产配置时仍可 Node 启动并返回 live 200、ready 503；
- `/api/environment` 的 Session、repository、AES cipher、personal credential sync、
  audit/event 都在 API ports/adapters 后，生产实现使用 Better Auth cookie、Drizzle、
  `@sim/security`、`@sim/audit` 与懒加载 PostHog sink；进程退出时会 flush telemetry；
- `/api/status` 保留 Incident summary、两分钟内存缓存、旧 body、Cache-Control 和
  X-Cache 行为；失败保持 200 + `status=error`；
- 三个 Next route 已变为 1.24 KB gzip 以内的兼容 facade，不再 import DB、Auth、
  encryption、Audit 或旧 route implementation；
- proxy 支持逐路由 `api/legacy/off`、100ms–120s timeout、request ID/cookie/body 透传、
  远端 legacy deployment 回滚和 API transport failure fallback；
- API 使用 split build，启动 entry 从 2.31 MB 收紧到 17.37 KB；DB/Auth/环境 adapters
  只在生产配置完整时动态加载；
- Node cold-start 基线为 1,978.91 ms、213.7 MiB RSS、81.4 MiB heap，预算 5s /
  384 MiB / 192 MiB；
- API tests 10/10、API contract tests 3/3、proxy tests 3/3、logger tests 25/25、W1
  独立 type graph、API/auth/contracts type-check、API build、standalone Node probe 和
  C/D/I/P gates 全部通过；`/api/status` 对未知 query 的 400 wire contract 也保持旧行为；
- 全 Sim type-check 在最终复核时被系统以 `-1` 终止且没有类型诊断；当时只读证据显示
  Polaris Next 进程占约 6.9 GiB。最终 W1 专用 type-check 与 Vitest 均通过，不能把该
  资源终止误写为全量 type-check 通过。

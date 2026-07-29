# Phase 4 W2 原生路由与 Stars 检查点

> 日期：2026-07-30
> Ticket：10a
> 状态：完成并等待提交

## 结果

W2 tenant-read backend 不再是一个只能整体调用旧服务的 adapter。独立 API 现在按稳定
inventory ID 选择原生 handler，未迁路由才进入 compatibility fallback：

```text
TenantReadModule
  -> RoutedTenantReadBackend
     -> API-0294: native GitHubStarsHandler
     -> other 21: HttpLegacyTenantReadBackend
     -> no legacy origin: fail-closed 503
```

backend 选择写入版本化路由契约和生成 coverage，API 响应通过
`x-sim-api-backend=native|legacy-origin-compatibility` 暴露真实状态。CI 同时核对 contract
和 coverage，避免文档把未迁路由误标成 native。

## 首条原生路由

`API-0294 GET /api/stars` 已完全在独立 API 内实现：

- 拒绝未知 query，保持旧 Zod validation error shape；
- 请求 GitHub repository API，保留 Accept、API version、User-Agent 和可选 token；
- 进程内缓存一小时；
- 使用相同的 `k` 格式化和 `28.9k` fallback；
- Provider 非 2xx、异常、缺字段或无效值都不影响公开页面。

这是 public 路由，不加载 Better Auth 或数据库。生产 composition 在未配置 legacy origin
时仍能服务 stars；其余 21 条若没有 legacy origin 会稳定返回 503。

## 证据

| Gate | 结果 |
| --- | --- |
| Native routes | 1/22 |
| Legacy compatibility routes | 21/22 |
| W2 API tests | 41/41 |
| API total tests | 53/53 |
| API Contract tests | 6/6 |
| API/type contract checks | 通过 |
| Generated coverage | 22/22；backend 状态一致 |
| Platform Contract | 39 schemas；clean |
| API split build entry | 20.64 KiB |
| W1 Node cold start | 3,656.6 ms / 205.2 MiB RSS |
| Target structure | 33 roots / 25 required files |
| Target cycles | 22 packages / 96 source nodes；0 cycle |

全仓 TypeScript 检查 43/43 packages 通过。全仓测试和 build 仍有与本次 diff 无关的 Windows
环境限制：

- Desktop vault 的 owner-only POSIX mode 断言在 Windows 收到 mode `54`；
- Sim input-validation 的 unresolvable-hostname 断言受本机 DNS 行为影响；
- Desktop prebuild 从系统临时盘移动到 D 盘时触发跨卷 `EXDEV`；
- 同轮 Sim sandbox bundle 返回 AggregateError，因此没有继续宣称完整 Next build 通过。

这些路径没有被本检查点修改。失败命令留下的未跟踪 sandbox entry 已清理。

## 下一步

下一批迁移 session-bound 的 invitations、workspace members 和 Polaris personal-profile。
它们必须让认证 context 进入原生 handler，并用独立 authorization/repository ports 验证
租户边界；不能把 `apps/sim/lib/**` 的旧服务模块直接 import 到 API。

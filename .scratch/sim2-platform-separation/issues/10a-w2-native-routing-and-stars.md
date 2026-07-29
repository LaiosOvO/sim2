# W2 原生后端逐路切换与 Stars

Status: completed

## 范围

- 后端 port 返回明确的 `native` 或 `legacy-origin-compatibility` 状态；
- 按稳定 inventory ID 选择原生 handler；
- 未迁路由显式委托 legacy backend；没有 legacy origin 时 fail-closed；
- 首条原生路由：`API-0294 GET /api/stars`。

## 行为

Stars 原生 handler 保留：

- 不允许 query，错误 wire shape 与旧路由一致；
- GitHub API header 和可选 token；
- 一小时进程内缓存；
- 数字显示格式；
- Provider 非 2xx、异常、缺字段、无效数值时返回保守的 `28.9k`；
- 永不因 GitHub 故障返回 5xx。

## 证据

| Gate | 结果 |
| --- | --- |
| Native backend 状态 | 1/22 |
| Legacy compatibility 状态 | 21/22 |
| W2 API tests | 41/41 |
| API total tests | 53/53 |
| API Contract tests | 6/6 |
| Platform Contract | 39 schemas |
| API split build entry | 20.64 KiB |
| W1 Node cold start | 3,656.6 ms / 205.2 MiB RSS |
| Target cycles | 22 packages / 96 source nodes；0 cycle |

生产 composition 测试在没有 legacy origin 和认证配置时验证：

- `/api/stars` 返回 200，`x-sim-api-backend=native`；
- `/api/invitations` 返回 503，不会误放行或递归代理。

全仓 TypeScript 检查为 43/43 packages 通过。全仓测试在未修改的 Windows-only 断言处
失败：Desktop vault 的 POSIX mode 位断言收到 Windows mode `54`，Sim input-validation
的不可解析域名断言受本机 DNS 行为影响。全仓 build 又在 Desktop prebuild 从系统临时盘
rename 到 D 盘时触发 `EXDEV`，Sim sandbox bundle 同轮返回 AggregateError；完整 Next build
没有完成。失败路径均不在本次 diff，不能记录成业务回归，也不能记录成全仓绿色。

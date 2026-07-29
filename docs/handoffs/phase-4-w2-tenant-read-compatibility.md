# Phase 4 W2 租户只读兼容平面检查点

> 日期：2026-07-30  
> Ticket：10  
> 状态：Next 解耦完成；原生 read model 尚未完成

## 结果

W2 的第一组 22 条租户/成员只读接口已经从 Next 服务端实现中抽离。原路径保持不变，
但每个 `route.ts` 现在只调用一个轻量代理；独立 Node API 负责精确路由匹配、统一认证、
request ID、观测标签和旧服务调用。浏览器与 Next route 编译不再到达数据库、Better Auth
runtime、业务 repository、Executor、Sandbox 或 Registry。

```text
Browser
  -> generated Next facade (7 lines)
  -> apps/sim/lib/api-proxy/w2-tenant-read.ts
  -> standalone Node API tenant-read module
  -> TenantReadCompatibilityBackend port
  -> fixed pre-refactor legacy origin
```

这是一条 strangler 兼容路径。它已经解决当前最紧迫的编译边界问题，但后端数据查询仍由
旧部署执行，因此不能宣称 22 条 API 已经完成原生后端迁移。

## 规范范围

生成器从版本化契约中生成 22 个 facade、独立类型图和 coverage report。覆盖范围为：

| 领域 | 数量 |
| --- | ---: |
| invitations | 1 |
| organizations | 3 |
| permission-groups | 1 |
| stars | 1 |
| users | 2 |
| workspace-events | 1 |
| workspaces | 13 |
| 合计 | 22 |

`API-1060 /api/workspaces/[id]/personal-profile` 来自 Polaris，已经作为正式兼容路径加入，
不是在 Next 中复制 Polaris 服务端实现。

## 边界与回滚

- 默认 `SIM_API_W2_TENANT_READ_MODE=api`；
- `legacy` 让 Next 直接调用固定旧服务；
- `off` 返回稳定 503；
- `SIM_API_PROXY_FALLBACK_LEGACY=true` 只用于 API transport 故障回滚；
- `SIM_LEGACY_API_BASE_URL` 必须指向不会再次代理回新 API 的旧部署；
- Next 和 API 两层都拒绝 same-origin 递归；
- 每个响应携带 inventory ID、API module、backend 与请求 ID 标签。

API 的 `session`、`hybrid-all`、`session-internal` 路由先走统一 authenticator。公开 stars
与 workspace event poll 的公开/CRON 特殊语义暂由旧实现验证。租户授权仍由旧服务保留，
直到原生 repository adapter 替换完成。

## 测试证据

| Gate | 结果 |
| --- | --- |
| Generated facade check | 22/22 |
| Coverage check | 22/22，C/A/D/I |
| W2 API tests | 31/31 |
| W2 Next proxy tests | 25/25 |
| API Contract tests | 6/6 |
| API type-check | 通过 |
| Contract type-check | 通过 |
| W2 proxy isolated type-check | 通过 |
| Facade build isolation | 22 entries；最大 1,485 gzip bytes |
| Forbidden closure markers | 0 |
| Platform contract generation | 38 schemas；clean |
| API validation | 991/991 contract-backed；non-contract 0 |
| Target structure | 33 roots / 23 required files |
| Target cycles | 22 packages / 94 source nodes；0 cycle |

22 个当前 facade 合计 154 行；相对旧 route 实现，本次 route diff 删除 1,663 行并增加
104 行，净减少 1,559 行。共享代理本身 159 行，不随路由数量复制。

## 未完成项

下一检查点必须按 organization、workspace、user/access 三个 read model 深模块推进：

1. 定义 repository/query ports 和真实授权 target；
2. 先迁简单 list/availability，再迁 roster、fork diff、inbox、metrics；
3. 对每条路由记录 `legacy-origin -> native` backend 状态；
4. 使用同一 DB fixture 做旧/新差分；
5. 证明跨 workspace/org 访问拒绝、分页/过滤、空结果和 not-found；
6. 22/22 原生后才移除旧 origin 依赖。

因此 Ticket 10 当前只能标记为“兼容平面完成”，不能标记为“原生迁移完成”。

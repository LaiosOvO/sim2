# Phase 4 W2 原生 Polaris Personal Profile 检查点

> 日期：2026-07-30
> Ticket：10d
> 状态：完成

## 结果

`API-1060 GET /api/workspaces/[id]/personal-profile` 已从固定 legacy origin 切换为独立 API
原生查询。W2 当前为 4 条 native、18 条 compatibility：

```text
TenantReadModule
  -> API-0137: Invitations Module
  -> API-0294: GitHub Stars handler
  -> API-1057: Workspaces Module
  -> API-1060: Identity Module + Biz Identity + PostgreSQL adapter
  -> other 18: fixed legacy-origin compatibility backend
```

Next route 仍是生成式轻量 facade，编译闭包不包含 Identity Biz、Drizzle、Feishu SDK、
Executor、Sandbox 或 Registry。

## Polaris donor 到目标边界

| Donor | 目标 |
| --- | --- |
| `apps/sim/app/api/workspaces/[id]/personal-profile/route.ts` | API Identity interface |
| `apps/sim/lib/polaris/identity/personal-profile.ts` | Identity application/Biz service |
| `externalIdentity` schema + 0273/0278/0289 演进结果 | 目标 `external_identity` + 新 0275 |

没有直接复制 Polaris migration 编号，因为 Sim2 的 0273 已有其他历史。目标 migration
以当前目标 schema 历史为准，合并 donor 表的最终字段和 conditional unique indexes。

## Provider-neutral Identity

Biz contract 只暴露：

```text
providerKey + tenantKey + externalSubjectId
+ identifiers: Record<string, string>
```

Feishu alias 只在 PostgreSQL adapter 读出，并在 API compatibility mapping 中恢复旧 wire
字段。新增 `check:identity-boundary` 会拒绝 Biz 导入 Feishu/Lark、DB、应用或基础设施，也会
拒绝 API Identity core 导入数据库和 Provider SDK。

## 鉴权与错误

复用 standalone API 的 `authorizeRequestContext`：

- 缺少 session 保留 Polaris `401 Authentication required`；
- workspace access denied 保留带 request ID 的 typed 403；
- profile 缺失与未分类异常保留带 request ID 的 generic 500；
- `rawProfile` 永远不进入 response contract。

## 验证

| Gate | 结果 |
| --- | --- |
| Native routes | 4/22 |
| Legacy routes | 18/22 |
| API tests | 68 passed；1 skipped |
| W2 focused tests | 56 passed；1 skipped |
| PostgreSQL integration | 真正执行 0275 migration，1/1 |
| API contract tests | 9/9 |
| Platform contract | 50 schemas |
| API standalone/build | Node smoke 通过；entry 23.0 KiB |
| Full repository type-check | 43/43 tasks |
| Identity boundary | 3 boundaries / 9 files |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Target structure | 44 roots / 34 files |
| Target graph | 22 packages / 114 source nodes；0 cycle |

## Node/Bun 与飞书/Sandbox 结论

本接口证明 Identity read path 不需要 Feishu SDK。后续飞书 Bot 长连接应由 Node 22.19+
`feishu-ingress` role 接收、归一化并投递幂等 job；Sandbox 是 Worker 下游执行能力，不能与
长连接进程混合。Bun 可以继续用于 install/build/test/script，但 `isolated-vm` 的 native
ABI 和 worker 进程必须由 Node 运行，当前不规划将 Sandbox 生产 runtime 改为 Bun。

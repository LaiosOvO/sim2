# W2 原生 Polaris Personal Profile

Status: completed

## 范围

- `API-1060 GET /api/workspaces/[id]/personal-profile`
- Polaris donor 的个人账号、当前 workspace 与外部身份只读语义
- `external_identity` provider-neutral read model 与目标数据库迁移
- 独立 Identity Module：`interface / application / ports / index.ts`
- W2 每路 backend 从 compatibility 切为 native

## 边界

```text
Next generated facade
  -> standalone API W2 router
     -> Identity HTTP interface
        -> workspace authorization
        -> PersonalIdentityProfileService (Biz)
           -> PersonalIdentityProfileRepository port
              -> Drizzle PostgreSQL adapter
```

`extensions/biz/identity` 只认识 `identifiers: Record<string, string>`，不认识 Feishu
`openId/unionId`、SDK、数据库或 HTTP。旧 wire 为兼容 Polaris 仍保留这些字段，但只在 API
transport 边界从通用 identifiers 映射。

## 数据迁移

目标 Sim2 schema 原来没有 Polaris 的 `external_identity`。本 Ticket 通过目标库的 Drizzle
历史生成 `0275_polaris_external_identity_read_model.sql`，没有复制 donor 已占用且与目标
冲突的 migration 编号。迁移只引入本读取接口需要的最终兼容表和索引；identity provider
配置、同步任务与生命周期表仍属于后续 Identity/Feishu Infra 迁移。

## 兼容语义

- 无 session：`401 {"error":"Authentication required"}`；
- 无 workspace 权限：`403 {"error":"Workspace access denied: <id>","requestId":"..."}`；
- 当前账号、workspace 或 profile 缺失：`500 {"error":"Internal server error","requestId":"..."}`；
- response 经过 V1 schema 白名单，不返回 `rawProfile`。

## 证据

| Gate | 结果 |
| --- | --- |
| Native backend | 4/22 |
| Legacy compatibility | 18/22 |
| API tests | 68 passed；1 个 disposable DB test 默认跳过 |
| W2 focused tests | 56 passed；1 个 disposable DB test 默认跳过 |
| Real PostgreSQL | PostgreSQL 16 disposable container，真实执行 0275，1/1 |
| API contract tests | 9/9 |
| Platform contract | 50 schemas |
| API build | entry 23.0 KiB；identity adapter 2.89 KiB lazy chunk |
| Full repository type-check | 43/43 tasks |
| Next facade isolation | 22 entries；最大 1,485 gzip bytes |
| Identity boundary | 3 boundaries / 9 files；0 provider/DB 反向依赖 |
| Target structure | 44 roots / 34 required files |
| Target cycles | 22 packages / 114 source nodes；0 cycle |

真实数据库测试覆盖迁移可执行性、workspace/org/user 关联、多个 provider 的稳定排序、alias
白名单映射和 `rawProfile` 不泄露。测试曾捕获“结构类型不会在运行时裁剪整行对象”的问题，
修复后只允许 `providerUserId/openId/unionId` 进入兼容 identifier 映射。

## 后续

继续按 Ticket 10 的 inventory 优先级替换剩余 18 条 backend。Feishu 长连接、目录同步、
credential reconcile 和事件归一化迁入 `extensions/infra/feishu-channel` 与独立 Node
ingress role，不得放入本 Biz/API read path，也不得直接触发 Sandbox。

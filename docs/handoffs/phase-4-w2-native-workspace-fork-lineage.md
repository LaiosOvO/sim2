# Phase 4 Handoff：W2 原生 Workspace Fork Lineage

## 结果

`API-1034 GET /api/workspaces/[id]/fork/lineage` 已从固定 legacy origin 切为独立
Workspace Forking Module。W2 当前为 native `13/22`、legacy `9/22`。

Sim2 与 Polaris 的 route、lineage helper、fork authz 和 promote-run store 内容一致，因此
本阶段没有 Polaris-only 行为取舍。原生实现保持 donor wire 行为，同时移除了 parent/child
权限投影的 N+1。

## 边界

- Web/Next facade 仍是生成式代理，不导入 lineage helper、权限 resolver、数据库 schema、
  Billing、AppConfig、Executor、Registry 或 Sandbox。
- `packages/api-contracts` 只拥有 workspace id、lineage node/child、undoable run 和
  `push | pull` direction 的 V1 wire contract。
- Workspace Forking application 拥有认证后的编排和错误优先级，并与 API-1031 共用
  `evaluateForkingAccess`。
- current-access port 负责“active workspace + 当前 viewer 有效权限”；application 不知道
  权限如何从 explicit grant 或 organization role 派生。
- lineage port 是 viewer-specific 深层读取接口，向 application 一次返回 parent、
  newest-first children、访问投影和最新 undo point。
- PostgreSQL lineage adapter 隐藏 workspace self-join、promote-run join 和批量权限投影；
  child 数量增加不会增加权限查询批次。
- `packages/platform-authz` 继续拥有 canonical workspace 授权规则，并增加批量
  `resolveAccessibleWorkspaceIds`，避免在 adapter 中复制 owner/admin 角色判断。

## 兼容性决定

处理顺序保持：

1. session 用户认证；
2. workspace id 校验；
3. active current workspace 与有效权限读取；
4. deployment / Enterprise / AppConfig gate；
5. current workspace 必须有 admin 权限；
6. 读取 viewer-specific lineage。

对应错误保持：

- 无 session：`401 Unauthorized`；
- 参数错误：`400 Validation error`；
- current workspace 不存在或已归档：`404 Workspace not found`；
- deployment 或 rollout 未启用：`404 Workspace forking is not enabled on this deployment`；
- 非 Enterprise：`403 Workspace forking is available on Enterprise plans only`；
- 非 current workspace admin：`403 Admin access is required for this workspace`；
- 未预期异常：`500 Internal server error`，携带 `requestId`。

Lineage 语义保持：

- parent 仅返回 active 直接父工作区；
- children 仅返回 active 直接 fork，按 `createdAt DESC`；
- `viewerAccessible` 同时认可 explicit read/write/admin 与 organization owner/admin 继承；
- 最新 undo point 按 target workspace 和 promote-run `createdAt DESC`；
- source workspace 即使 archived 也保留名称；source 不存在时名称回退为 `workspace`。

## 性能变化

donor 对 parent 和每个 child 分别调用有效权限解析，organization workspace 还会追加
membership 读取，因此权限查询量随 lineage 数量线性增长。

原生 adapter 先并行读取 parent、children 和 latest promote run，再以两批查询读取 explicit
permissions 与 organization memberships。权限投影查询批次数为固定上界；数据库细节被
封装在 deep read model 内，没有泄漏到 use case 或 Web facade。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 13/22 / 9/22 |
| API-1031/API-1034 focused tests | 16/16 |
| API full tests | 20 files passed、1 skipped；131 tests passed、1 skipped |
| API Contracts | 16/16 |
| PostgreSQL integration | 1/1；临时容器已销毁 |
| API / Contracts / Platform Authz type-check | 全部通过 |
| Workspace Forking boundary | 11 module files / 6 adapters |
| Target structure | 57 roots / 90 required files |
| W2 coverage | 22/22 |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| API build | 1,146 modules；entry 34.82 KiB |
| Standalone Node API | health 200；unconfigured readiness 503 |
| Target graph | 23 packages / 174 source nodes；0 cycle |
| Browser closure | `api-or-worker=0`；`infra-extensions=0` |
| 其他门禁 | contract purity、monorepo boundary、browser policy、proxy types、contract artifacts 全部通过 |

并发只读审查发现并修复了一个兼容边缘：旧实现允许父工作区名称为空字符串，原生 adapter
不能用字符串 truthiness 判断 left join 是否命中。当前实现只判断 join 字段是否为 `null`，
并已把空名称父节点加入真实 PostgreSQL 回归测试。

## 主线同步

后续 Sim2 主线修改以下位置时，按
`docs/migration/module-alignment-matrix.md` 的 API-1034 行同步：

- `apps/sim/app/api/workspaces/[id]/fork/lineage/route.ts`；
- `apps/sim/ee/workspace-forking/lib/lineage/lineage.ts` 与 `authz.ts`；
- workspace effective permission 规则；
- `apps/sim/ee/workspace-forking/lib/promote/promote-run-store.ts` 与对应 schema。

只同步可观察合同、授权顺序、lineage 语义和对应 fixture，不恢复旧 helper import graph 或
逐 child 权限查询。

## 后续

- API-1032 diff 建立独立 diff read model，并复用 shared forking gate/current-access seam。
- API-1037 resources 建立独立 resource read model；不要把完整 workflow/resource registry
  引入 Workspace Forking Module。
- API-1036 promote 与 API-1038 rollback 属于命令路径，需补幂等、并发、审计和回滚测试后
  再迁移，不能直接复用只读 handler。

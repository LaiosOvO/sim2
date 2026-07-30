# W2 原生 Workspace Fork Lineage（API-1034）

接口清单编号：API-1034
接口：`GET /api/workspaces/[id]/fork/lineage`

状态：已完成 donor 审计、原生实现、测试与切流

## 1. Donor 证据

- Sim2 与 Polaris 的 route、lineage helper、fork authz 和 promote-run store 逐文件 SHA256
  一致；Polaris 没有额外业务分叉需要选择。
- 身份验证先于 params 校验；只接受存在 user id 的 session。
- 当前 workspace 必须 active。不存在或 archived 返回
  `404 Workspace not found`。
- donor 在判断 admin 之前先执行统一 forking gate：
  - billing 关闭且 deployment flag 关闭：
    `404 Workspace forking is not enabled on this deployment`；
  - billing 开启但 workspace 没有 Enterprise organization entitlement：
    `403 Workspace forking is available on Enterprise plans only`；
  - hosted AppConfig rollout 未命中：
    `404 Workspace forking is not enabled on this deployment`；
  - gate 通过但当前 workspace 有效权限不是 admin：
    `403 Admin access is required for this workspace`。
- parent 只在当前 workspace active、`forkedFromWorkspaceId` 非空且 parent active 时返回。
- children 只含 active 直接 fork，按 `createdAt DESC` 排序。
- parent/children 对当前 viewer 的任意有效 workspace 权限投影
  `viewerAccessible`；有效权限包括 explicit read/write/admin 与 organization owner/admin
  继承。
- 最新 undo point 按 target workspace 和 `createdAt DESC` 选择；`sourceWorkspaceId`
  对应 workspace 即使 archived 也保留名称，不存在时名称回退为 `workspace`。
- wire contract：
  `{workspaceId,parent,children,undoableRun}`；child `createdAt` 为 ISO 字符串，
  direction 为 `push | pull`。

## 2. Donor 性能缺陷

route 对 parent 和每个 child 分别调用
`getEffectiveWorkspacePermission`。每个调用至少读取 explicit permission，organization
workspace 还可能读取 membership，因此 lineage 长度为 N 时权限查询为 O(N)，是确定的 N+1。

## 3. 原生模块设计

### 3.1 共享 Forking Gate

把 API-1031 内部的 availability 逻辑提升为 Workspace Forking Module 的共享 policy：

```text
evaluateForkingAccess(userId, organizationId)
  -> available | deployment-disabled | enterprise-required
```

API-1031 把任意失败折叠为 `{available:false}`；API-1034 保留具体 gate reason 和 donor
HTTP 文案。这样后续 diff/resources/commands 不再复制 entitlement/AppConfig 次序。

### 3.2 当前工作区访问接缝

`WorkspaceForkCurrentAccessReader.findActiveForViewer(workspaceId, viewerId)` 返回：

- organizationId；
- effective permission。

PostgreSQL adapter 只读取一次 active workspace，再把已知 organizationId 传给 canonical
workspace permission resolver；不会像组合 `WorkspaceForkContextReader` +
`RequestAccessResolver` 那样重复读取当前 workspace。

### 3.3 深层 Lineage 读取模块

`WorkspaceForkLineageReader.readForViewer(workspaceId, viewerId)` 是 viewer-specific query
interface。PostgreSQL adapter 内部隐藏：

1. current → active parent self join；
2. active children newest-first query；
3. latest promote run → source workspace left join；
4. explicit permissions 与 organization memberships 两个批量 query。

不把 persistence rows、Drizzle 或权限查询步骤暴露给 application。parent/children 数量增加
时仍是固定上界的查询批次，不产生 N+1。

### 3.4 Application 编排顺序

```text
authenticate
  -> validate workspace id
  -> current active workspace + effective permission
  -> shared deployment/Enterprise/AppConfig gate
  -> require current permission=admin
  -> viewer-specific lineage read model
  -> contract parse + JSON response
```

此顺序保留 donor 的错误优先级，同时避免未通过 gate/admin 的请求加载 lineage。

## 4. 已实现内容

- `packages/api-contracts/src/workspace-forking.ts`
  - 新增 `push | pull` direction、parent、child、undoable run 和完整 response 的 V1
    Zod contract；
  - child `createdAt` 只接受 ISO datetime。
- `apps/api/src/modules/workspace-forking`
  - 从 API-1031 提升出共享纯 policy `evaluateForkingAccess`；
  - 新增 `GetForkLineageUseCase`，固化
    validation → current access → gate → admin → lineage 的顺序；
  - 新增独立 HTTP handler，保持 donor 的 401/400/403/404/500 wire 行为；
  - 新增 current-access 和 viewer-specific lineage 两个窄 port。
- `apps/api/src/infrastructure/postgres/repositories`
  - current-access adapter 只读取一次 active workspace，再调用 canonical effective
    permission resolver；
  - lineage adapter 并行读取 parent、children、latest promote run，随后批量投影
    parent/children 可见性；
  - archived parent/child 隐藏，archived source 仍保留名称，缺失 source 名称回退
    `workspace`。
- `packages/platform-authz/src/workspace.ts`
  - 新增批量 workspace access resolver；
  - explicit read/write/admin 与 organization owner/admin 继承都算可访问；
  - 权限投影使用固定查询批次，不随 child 数量线性增加。
- API composition、W2 contract/coverage 和生成式 Next facade routing 已将 API-1034
  标记为 native；legacy backend 不再处理该接口。

## 5. 测试覆盖

- contract：parent、child ISO、nullable organization、undoable direction/name；
- auth/error precedence：401、validation 400、missing 404、deployment 404、Enterprise 403、
  admin 403、unexpected 500 + requestId；
- projection：explicit access、org-admin inherited access、no access；
- lineage semantics：archived parent/child 隐藏、newest-first、null lineage；
- undo：latest target run、archived source name、missing source fallback；
- performance behavior：application 只调用一次 deep read model；real PostgreSQL fixture
  覆盖批量 access projection；
- routing：API-1034 独立 API native attribution，不触发 legacy backend；
- gates：Workspace Forking boundary、W2 coverage、contract purity、type-check、build、standalone
  Node smoke、browser closure/facade/build graph。

## 6. 验证结果

| 验证项 | 结果 |
| --- | --- |
| API-1031/API-1034 focused tests | 16/16 通过 |
| API 全量测试 | 20 个文件通过、1 个跳过；131 个测试通过、1 个跳过 |
| API Contracts | 16/16 通过 |
| 真实临时 PostgreSQL | 1/1 通过；容器已销毁 |
| API / Contracts / Platform Authz type-check | 全部通过 |
| Workspace Forking boundary | 11 个 Module 文件 / 6 个 adapters |
| Target structure | 57 个 roots / 90 个必需文件 |
| W2 coverage | 22/22；native 13/22，legacy 9/22 |
| W2 facade build | 22 个 entries；最大 1,485 gzip bytes |
| API build | 1,146 modules；entry 34.82 KiB |
| Standalone Node API | health 200；未配置 readiness 503 |
| Target module cycles | 23 packages / 174 source nodes；无 cycle |
| Browser closure | `api-or-worker=0`，`infra-extensions=0` |
| 其他结构门禁 | contract purity、monorepo boundary、browser policy、proxy types、contract artifacts 全部通过 |

并发审查额外发现并修复了一个 donor 兼容边缘：父节点不能用 `id/name` 的字符串
truthiness 判断 left join 是否命中，否则合法的空字符串名称会被误投影为 `parent:null`。
实现现只按 join 字段是否为 `null` 判断，真实 PostgreSQL fixture 已加入空名称回归并通过。

## 7. 结论

API-1034 已从“Next route 直接组合 lineage helper、全局 gate 和逐项权限查询”改成一个
深层 Workspace Forking 读取模块。Web 侧只保留稳定合同和生成式代理；服务端内部把 gate、
当前访问、viewer-specific lineage 与数据库实现分层。此次迁移不仅切除了 legacy origin，
还消除了 donor 中随 lineage 数量增长的权限 N+1。

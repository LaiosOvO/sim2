# W2 原生 Workspace Fork Resources（API-1037）审计与冻结设计

接口清单编号：API-1037  
接口：`GET /api/workspaces/[id]/fork/resources`

状态：donor 审计与原生迁移设计已冻结；尚未实现。

## 1. 审计范围与结论

本接口是“创建 workspace fork 前的可复制资源清单”，不是资源复制、执行或解密接口。
客户端只需要资源的 `id`、展示名称、文件文件夹分组，以及可复制的已部署 workflow 数量。

关键结论：

1. Sim2 与 Polaris 的 route、HTTP contract、React Query hook、fork modal 完全一致。
2. 唯一 donor 分叉在文件文件夹表：
   - Sim2 已使用统一 `folder` 表，并要求 `resourceType = 'file'`；
   - Polaris 仍使用旧 `workspace_file_folders` / `workspaceFileFolder`。
3. 目标以 Sim2 主分支为底座且后续要持续同步，因此原生 PostgreSQL adapter 必须采用
   Sim2 的统一 `folder` 语义；不能把 Polaris 的旧文件夹表带进新的 application interface。
4. API-1037 的运行时链路不依赖 Block/Tool Registry、Executor、Sandbox、credential 解密或
   MCP 连接。它只读 PostgreSQL 的显式列。
5. donor 的主要正确性风险不是 N+1，而是七类清单分别执行无 `ORDER BY` 的
   `LIMIT 1000`：超过上限时返回哪个 1000 条不稳定，响应没有 `truncated` 标志，前端却把
   返回集合当成完整集合默认全选，未返回资源及其 workflow 引用可能在 fork 中被静默省略。
6. donor 每次成功请求固定并发发出 8 条资源 SQL；虽然不是随资源数量增长的 N+1，但高并发
   时会放大连接池压力，而且八个查询不在同一快照中。

## 2. Donor 文件证据与 SHA256

| 文件 | Sim2 SHA256 | Polaris SHA256 | 结论 |
| --- | --- | --- | --- |
| `apps/sim/app/api/workspaces/[id]/fork/resources/route.ts` | `D2A3AFC86D45B0EF26A3599C5402D517211ED081C2D735316E68E9B13330237E` | 相同 | 无分叉 |
| `apps/sim/ee/workspace-forking/lib/mapping/resources.ts` | `47631065C03C73F4069573533186010B95F105F6A3B84EAC80E318AC7B0B2004` | `E4183D8F7427A64F4B6A9E44583F14E2A53E3100E6B786141FEC2E8DAD99E031` | 仅文件夹表分叉 |
| `apps/sim/ee/workspace-forking/lib/lineage/authz.ts` | `6266AB9B0DC33C1654F428A1C6C3B77C09BA2875DFAD2D9AE92B57B2E6C3CAA9` | 相同 | gate/admin 语义一致 |
| `apps/sim/lib/api/contracts/workspace-fork.ts` | `84BF295C30ABD671386FEF4CA7A89B0808B9B95815865DC2339E03D17C997E71` | 相同 | wire contract 一致 |
| `apps/sim/ee/workspace-forking/hooks/workspace-fork.ts` | `13C2E2D672070FA0D4F8A1A4BC31A561C3A6281A242867BC95E52111B427BB34` | 相同 | 客户端请求/缓存一致 |
| `fork-workspace-modal.tsx` | `41B566022D62A6FC4008CF0CBB0199FBF8E4CFEDDAD1AAF8CAED01FA9E77D7E9` | 相同 | 客户端消费字段一致 |

`resources.ts` 的精确分叉只有：

```text
Sim2:
  workspace_files.folder_id
    -> folder.id
    AND folder.resource_type = 'file'
    AND folder.deleted_at IS NULL

Polaris:
  workspace_files.folder_id
    -> workspace_file_folders.id
    AND workspace_file_folders.deleted_at IS NULL
```

目标选择：采用 Sim2 统一 `folder` 表。数据库迁移兼容旧表属于 DB migration 层的责任，不进入
`WorkspaceForkResourcesReader` 的 interface。

## 3. Auth、Validation、Gate、Admin 精确优先级

donor 的顺序是：

```text
getSession
  -> parse/validate path params
  -> read active workspace + resolve effective permission
  -> deployment / Enterprise / AppConfig gate
  -> require admin
  -> list resources
```

逐项行为：

1. 无有效 session user id：
   - `401`
   - body：`{"error":"Unauthorized"}`
   - 不校验 workspace id，不访问 workspace/resource 数据。
2. 已认证后校验 params：
   - `id` 仅要求非空字符串，无 UUID、字符集或长度限制；
   - 失败返回 `400 {"error":"Validation error","details":[...]}`；
   - validation 失败不读取 workspace。
3. `checkWorkspaceAccess` 先读取 active workspace，再解析 effective permission：
   - workspace 不存在或已 archived：
     `404 Workspace not found`；
   - permission 解析已经发生，然后才进入 forking gate。
4. gate 顺序：
   - billing 关闭且 deployment `FORKING_ENABLED` 关闭：
     `404 Workspace forking is not enabled on this deployment`；
   - billing 开启但 workspace 没有 Enterprise organization entitlement：
     `403 Workspace forking is available on Enterprise plans only`；
   - AppConfig 是 source of truth 且 `workspace-forking` rollout 未命中：
     `404 Workspace forking is not enabled on this deployment`。
5. gate 通过后才检查 `canAdmin`：
   - effective permission 不是 admin：
     `403 Admin access is required for this workspace`。
6. 只有以上全部通过才读取资源。

因此必须保留“gate 错误优先于 admin 错误”的 donor 行为。不能为了少一次判断而先拒绝
non-admin，否则会改变 403/404 的可观察优先级。

`withRouteHandler` 的 donor 细节：

- 401、400 和成功响应的 body 不带 `requestId`，但 header 带 `x-request-id`；
- `ForkError` 抛出的 403/404 body 为 `{error, requestId}`；
- 未分类异常为 `500 {error:"Internal server error",requestId}`；
- 原生 handler 至少必须保持 status 与 `error` 文案完全一致。若 W2 的统一错误 envelope
  决定去除 typed 4xx body 中的 `requestId`，应作为平台级兼容决策记录，不能在本接口内偶然漂移。

## 4. 精确 query 语义

`listForkCopyableResources(db, workspaceId)` 使用 `Promise.all` 固定发出 8 个查询。所有资源列表
都没有 `ORDER BY`。

### 4.1 Files

投影：

```text
id         = workspace_files.id
label      = coalesce(workspace_files.display_name, workspace_files.original_name)
folderId   = workspace_files.folder_id
folderName = folder.name
```

过滤：

- `workspace_files.workspace_id = workspaceId`
- `workspace_files.context = 'workspace'`
- `workspace_files.deleted_at IS NULL`
- left join active generic `folder`，且 `folder.resource_type = 'file'`
- `LIMIT 1000`

重要语义：

- copy picker 使用的是 `workspace_files.id`，不是 storage key；
- root file 的 `folderId/folderName` 均为 `null`；
- folder 被删除、类型不是 `file` 或 join 不到时，原始 `folderId` 仍可能非空，而
  `folderName = null`；wire contract 允许这种组合。

### 4.2 Tables

投影 `user_table_definitions.id/name -> id/label`。

- workspace 匹配；
- `archived_at IS NULL`；
- `LIMIT 1000`。

### 4.3 Knowledge bases

投影 `knowledge_base.id/name -> id/label`。

- workspace 匹配；
- `deleted_at IS NULL`；
- `LIMIT 1000`。

Knowledge documents 不单独列出；复制时跟随其 knowledge base。

### 4.4 Custom tools

投影 `custom_tools.id/title -> id/label`。

- workspace 匹配；
- `LIMIT 1000`；
- donor 没有 archived/deleted 过滤，因为该表没有对应软删除语义。

`schema`、`code`、owner 等字段不读取、不下发。

### 4.5 Skills

投影 `skill.id/name -> id/label`。

- workspace 匹配；
- `LIMIT 1000`；
- donor 没有 archived/deleted 过滤。

`description`、`content`、owner 等字段不读取、不下发。

### 4.6 External MCP servers

投影 `mcp_servers.id/name -> id/label`。

- workspace 匹配；
- `deleted_at IS NULL`；
- `LIMIT 1000`。

绝不能扩大为整行查询。该表还包含 URL、headers、OAuth client id、加密的 OAuth client
secret、连接状态等字段；API-1037 只允许 `id/name` 投影。

### 4.7 Workflow-publishing MCP servers

投影 `workflow_mcp_server.id/name -> id/label`。

- workspace 匹配；
- `deleted_at IS NULL`；
- `LIMIT 1000`。

不读取 API key、workflow attachments 或执行配置。列表表示稍后可复制 config-only shell。

### 4.8 Deployed workflow count

返回满足以下全部条件的 workflow 数量：

- `workflow.workspace_id = workspaceId`
- `workflow.is_deployed = true`
- `workflow.fork_sync_excluded = false`
- `workflow.archived_at IS NULL`
- 至少存在一条相同 workflow id 且 `workflow_deployment_version.is_active = true` 的版本。

这里使用 correlated `EXISTS`，不会因多个 deployment version 把 workflow 重复计数。
接口不读取 deployment state，也不加载 Executor。

## 5. 精确 wire contract

成功状态 `200`，必需字段如下，没有 optional 字段：

```json
{
  "files": [
    {
      "id": "workspace-file-row-id",
      "label": "brief.pdf",
      "folderId": "folder-id-or-null",
      "folderName": "Folder name or null"
    }
  ],
  "tables": [{ "id": "table-id", "label": "Customers" }],
  "knowledgeBases": [{ "id": "kb-id", "label": "Handbook" }],
  "customTools": [{ "id": "tool-id", "label": "Normalize lead" }],
  "skills": [{ "id": "skill-id", "label": "Sales research" }],
  "mcpServers": [{ "id": "mcp-id", "label": "Internal MCP" }],
  "workflowMcpServers": [{ "id": "wmcp-id", "label": "Published workflows" }],
  "deployedWorkflowCount": 3
}
```

类型约束：

- 普通资源：`{id: string, label: string}`；
- file：普通资源字段加 `folderId: string | null`、`folderName: string | null`；
- 七个数组全部存在；
- `deployedWorkflowCount` 是 integer；
- donor response schema 没有数组长度、id 长度、label 长度或非负数约束；
- 数组顺序没有合同保证。

## 6. 前端实际需要的数据与浏览器边界

`useForkResources` 只在 modal open 且有 workspace id 时发请求，React Query `staleTime = 30s`。
客户端消费行为：

1. 七类数组的 `length`：决定是否显示资源种类；
2. 每项 `id`：维护 checkbox selection，并原样进入 fork POST 的 `copy` arrays；
3. 每项 `label`：展示；
4. files 的 `folderId/folderName`：构建 folder -> file 树；
5. `deployedWorkflowCount`：为 0 时显示“会创建 blank starter workflow”的提示；
6. 首次加载成功后，把所有返回项默认选中；
7. 资源请求未完成时禁用 Fork，避免把 unloaded state 当空 selection。

浏览器不需要、也不允许收到：

- credential / environment-variable id、名称、密文或明文；
- MCP headers、OAuth token、OAuth client secret、URL；
- custom-tool code/schema；
- skill content；
- knowledge documents/chunks；
- workflow state、deployment snapshot；
- Registry metadata、Executor state、Replay/Debug 数据或 Sandbox 信息。

donor 客户端运行时会导入一个很大的 `workspace-fork.ts` contract 文件，但这个 contract 是
Zod/纯边界代码；它没有导入 Registry、Executor 或 Sandbox。目标应继续通过纯
`@sim/api-contracts/workspace-forking` 子路径和生成式 facade 提供合同，禁止 Web 直接导入
`apps/api`、`@sim/db` 或新的 PostgreSQL adapter。

## 7. Registry、Executor、Sandbox、DB 与加密依赖判定

| 依赖 | API-1037 当前是否需要 | 结论 |
| --- | --- | --- |
| Block/Tool Registry | 否 | 不解析 workflow block/tool 引用，不得导入 registry |
| Executor | 否 | 只统计有 active deployment 的 workflow，不加载 state 或执行引擎 |
| Sandbox | 否 | 不执行 custom tool/skill/workflow，不启动 Node worker |
| PostgreSQL | 是 | 只读显式投影；属于 infrastructure adapter |
| Credential store / decryptor | 否 | credentials/env vars 明确不属于 copy picker |
| MCP secret decryptor | 否 | 只读 MCP `id/name`，不得 `select *` |
| Object storage | 否 | 文件只返回 DB metadata，不取文件内容、不签名 URL |

虽然 donor route 不直接拖入 Registry/Executor/Sandbox，它导入的 `resources.ts` 同时承载
mapping candidates、copy labels、credential classification 等大量无关函数，是一个过宽、
低 locality 的实现文件。原生迁移不能整体搬运该文件；只提取 API-1037 的深读取语义。

## 8. 批量查询、payload 与泄密风险

### 8.1 固定八查询，不是 N+1

资源数量增长不会增加 SQL 次数；成功请求固定为七个列表查询加一个 count 查询。它优于
per-resource 查询，但 `Promise.all` 可能同时占用最多八个 pool checkout。再加 auth、permission、
entitlement、rollout 查询，一次 HTTP 请求的数据库/远端操作不止八次。

冻结要求：

- 原生 application 只能调用一次资源 reader；
- reader 内 SQL 次数必须是固定 O(资源种类)，不得在结果循环里查 folder、deployment 或 secret；
- adapter 应记录整体耗时和各 kind count，不能记录 label、id 或任何 secret 字段；
- 初次迁移允许保留固定八查询以降低语义风险；后续可在 adapter 内替换为 CTE/JSON aggregate
  或受控串/并行策略，调用方 interface 不变。

### 8.2 无序截断风险

每类 `LIMIT 1000` 但没有 `ORDER BY`，因此：

- 超过 1000 条时结果集合不稳定；
- 客户端不知道发生截断；
- “默认全选”实际只是“默认选择返回的 1000 条”；
- 用户无法选择未返回资源；
- fork POST 可能清空 workflow 对这些资源的引用。

为了 API-1037 donor 兼容，首轮迁移不偷偷改变 wire。应：

1. 原生 adapter 保留单类上限 1000，并对命中上限打无 PII metric；
2. 在后续 V2 contract 增加每类 `total/truncated` 或 cursor；
3. V2 使用稳定排序（建议 label + id）；
4. truncated 时前端必须阻止“把返回项当完整全集”或明确提示；
5. 不应在原有 response 中临时塞未声明字段。

### 8.3 Payload 风险

理论最大为 7000 个资源条目，label 来自 PostgreSQL `text` 且 response contract 无长度上限。
恶意或异常长名称可能造成大 JSON、浏览器内存和日志问题。首轮保持 wire 兼容，但必须：

- 只做窄列投影，绝不返回整行；
- 不在日志中打印完整 response；
- 记录 response bytes/counts；
- 由资源写入合同逐步收紧名称上限；
- V2 分页后再设置明确 page/response 上限。

### 8.4 快照一致性

八个 donor 查询可能运行在不同连接和快照中。请求期间资源或 deployment 变化时，列表和
count 可能来自略有差异的时刻。此接口是 fork 前预览，真正 POST 必须重新授权和校验 selection；
不能把 GET 的结果视为授权或存在性凭证。

### 8.5 泄密面

- workspace admin 才能读取 inventory；
- non-admin 在 gate 通过时仍会得到“Admin required”，但不会得到资源；
- labels/ids 本身也是 workspace metadata，不能进入公共缓存；
- response 必须带 private/no-store 语义或仅使用 authenticated per-user browser cache；
- adapter 通过显式 `select` 保证 MCP secret、custom tool code、skill content 永不进入对象；
- POST 必须重新检查每个 id 属于 source workspace，防止 crafted selection 越权；
- object ids 不构成 capability，不能凭 GET 返回 id 跳过后续授权。

## 9. 冻结的深模块设计

### 9.1 复用既有 access 与 gate seam

API-1034 已建立：

```text
WorkspaceForkCurrentAccessReader.findActiveForViewer(workspaceId, viewerId)
evaluateForkingAccess(userId, organizationId)
```

API-1037 必须复用它们，不再创建第二套 workspace lookup、entitlement 或 AppConfig 判断。

### 9.2 新的资源读取 interface

新增一个深 interface，而不是七个浅 reader：

```ts
interface WorkspaceForkResourcesReader {
  read(workspaceId: string): Promise<WorkspaceForkResourcesSnapshot>
}
```

`WorkspaceForkResourcesSnapshot` 直接使用/对齐
`GetForkResourcesResponseV1`。interface 的完整不变量：

- 只返回七类 copyable metadata 和 deployed workflow count；
- 每类最多 1000；
- files 用 `workspace_files.id`；
- Sim2 generic folder join；
- 所有 active/deleted/excluded/deployment filters 与 donor 一致；
- 不保证排序；
- 不返回 credentials、env vars、content、code、state 或 secrets；
- 数据访问批次固定，不随资源数量增长。

把过滤、投影、folder join、deployment `EXISTS`、并行策略和 cap 都隐藏在 adapter 里，给
application 一个方法。这产生 leverage 和 locality；把七类分别做成 port 只会把 SQL 编排和
一致性规则泄露给 use case，是浅 module。

### 9.3 PostgreSQL adapter

建议文件：

```text
apps/api/src/infrastructure/postgres/repositories/
  drizzle-workspace-fork-resources-reader.ts
```

生产 adapter：

- 使用 `@sim/db/schema` 的显式表与显式列；
- 采用 Sim2 `folder` 表；
- 内部常量 `RESOURCE_LIMIT = 1000`；
- 固定批量读取，无 per-row lookup；
- 使用 schema response parse 作为返回前防线；
- 不导入任何 UI、Registry、Executor、Sandbox、copy engine 或 decryptor。

测试 fake 是第二个 adapter，满足“两个 adapter 才是真 seam”：生产 PostgreSQL adapter 与
application/handler 测试的 in-memory fake。

### 9.4 Application interface 与编排

建议文件：

```text
apps/api/src/modules/workspace-forking/
  application/get-fork-resources.ts
  interface/create-get-fork-resources-handler.ts
  ports/workspace-fork-resources-reader.ts
```

编排冻结为：

```text
handler authenticate session user
  -> use case validate workspace id
  -> currentAccess.findActiveForViewer
  -> evaluateForkingAccess
  -> require permission=admin
  -> resources.read exactly once
  -> getForkResourcesResponseV1Schema.parse
  -> JSON
```

use case dependencies：

```text
currentAccess
resources
entitlement
rollout
runtime
```

错误 reason 复用 API-1034：

```text
validation-error
workspace-not-found
deployment-disabled
enterprise-required
admin-required
```

handler 负责唯一的 HTTP 映射与 unexpected 500 日志。resource reader 的异常不转换成
“空清单”，否则数据库故障会被误认为 workspace 没有资源并诱导用户创建不完整 fork。

### 9.5 Contract

在纯 `packages/api-contracts/src/workspace-forking.ts` 增加：

```text
forkCopyableResourceV1Schema
forkCopyableFileV1Schema
getForkResourcesResponseV1Schema
GetForkResourcesResponseV1
```

为保持 donor 兼容：

- 七个数组均 required；
- file folder 字段 nullable 但不 optional；
- count 为 integer；
- 首轮不添加 wire 字段；
- schema 可给数组加 `.max(1000)`，因为 adapter 已保证该不变量且不改变成功响应；
- label 暂不增加未经 donor 写入规则证明的长度限制。

## 10. 真实 PostgreSQL、合同与授权测试计划

### 10.1 Contract tests

1. 接受完整的七数组 + integer count；
2. 接受 file `folderId != null` 且 `folderName = null`；
3. 拒绝缺失任一数组；
4. 拒绝 file folder 字段 omission；
5. 拒绝非 integer count；
6. 若冻结 `.max(1000)`，验证 1000 通过、1001 拒绝；
7. 验证合同包 browser-pure，不可达 DB/Registry/Executor/Sandbox。

### 10.2 Handler / application tests

1. 无 session/user actor -> 401，use case 不调用；
2. invalid/empty/不可 decode workspace id -> 400，current access 不调用；
3. missing/archived workspace -> 404，gate/resource 不调用；
4. deployment disabled -> 404；
5. Enterprise required -> 403；
6. AppConfig rollout disabled -> 404；
7. gate 失败即使 permission 不是 admin，也先返回 gate 错误；
8. gate 通过但 non-admin -> 403，resource reader 不调用；
9. admin -> resource reader 恰好调用一次并返回精确 contract；
10. reader/contract parse unexpected error -> 500 + requestId；
11. typed error文案与 API-1034 保持同源；
12. API-1037 native route 命中时 legacy backend 不被调用。

### 10.3 真实 PostgreSQL fixture

在独立 workspace 中插入：

- root workspace file；
- active generic file folder 下的 file；
- deleted folder 下仍有 `folderId` 的 file；
- 非 `resourceType=file` folder 引用；
- deleted file、非 `context=workspace` file、其他 workspace file；
- active/archived table；
- active/deleted KB；
- custom tool（填入 sentinel code/schema）；
- skill（填入 sentinel content）；
- active/deleted MCP server（填入 sentinel headers/OAuth secret/URL）；
- active/deleted workflow MCP server；
- credentials 与 workspace env rows；
- workflow count 矩阵：
  - deployed + active version -> 计数；
  - deployed 但无 active version -> 不计；
  - not deployed -> 不计；
  - fork excluded -> 不计；
  - archived -> 不计；
  - 多 version 其中 active -> 只计一次。

断言：

1. 每类只出现同 workspace、符合 active filter 的行；
2. file 返回 row id 而不是 storage key；
3. active folder 返回 name，deleted/wrong-kind folder 返回 `folderName:null`；
4. credentials/env/documents 不出现在 response；
5. JSON 序列化结果中不存在所有 sentinel secret/code/content；
6. deployed count 精确；
7. 通过 `generate_series` 插入 1001 条同类资源，返回不超过 1000，并记录 cap metric；
8. query instrumentation 证明资源 reader SQL 批次是固定值，不随行数增长；
9. workspace id 使用参数化 SQL，不存在注入路径。

### 10.4 结构与回归门禁

- API focused/full Vitest；
- API contracts tests/type-check；
- real PostgreSQL fixture；
- workspace-forking module boundary；
- target structure validation；
- W2 coverage：API-1037 从 legacy 改为 native；
- facade build；
- API production build + standalone Node smoke；
- browser closure：`apps/api`、`@sim/db`、Registry、Executor、Sandbox 可达数保持 0；
- dependency cycle / monorepo boundary / contract purity。

## 11. 实现决策摘要

1. 采用 Sim2 generic `folder`，不复制 Polaris legacy `workspaceFileFolder`。
2. 复用 API-1034 的 current-access 与 shared forking gate。
3. 新增一个深 `WorkspaceForkResourcesReader.read(workspaceId)`，不拆七个浅 port。
4. 首轮保持 donor wire、filters、1000 cap 和无排序语义，避免迁移时混入产品变更。
5. 明确禁止 Registry、Executor、Sandbox、credential/MCP decryptor 进入该 module。
6. 使用窄列投影；真实 PG 测试用 sentinel 证明 secrets/code/content 不会泄漏。
7. 将“无序静默截断”登记为后续 V2 必修项；V2 才增加 total/truncated/cursor 和稳定排序。
8. GET 只是预览；fork POST 必须重新授权、校验 workspace ownership 与资源存在性。


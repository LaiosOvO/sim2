# Sim2 主线同步与 Polaris 能力迁移对齐表

> 状态：目标仓库维护基线
> 日期：2026-07-30
> Sim2 upstream baseline：`c3ed1e9d7a388929c0acd22b7de39d6ab06adc5c`
> Polaris donor baseline：`f3d19f2b7ccfd85c28db1df307c86a1aa2adec32`

## 1. 文档职责

本文档回答两个长期维护问题：

1. Sim2 `main` 更新某个目录后，目标仓库应把变化同步到哪里；
2. Polaris 的业务能力从哪里迁出、最终由哪个 Module/Adapter 拥有。

API 的逐路径归属不在此重复，使用规范性 API inventory 中的 `API-nnnn`、Target 和 Wave。
本表负责 module 级影响；API inventory 负责 1,126 条路径级完整性。

## 2. 同步策略代码

| 代码 | 含义 | 合并方式 |
| --- | --- | --- |
| M | Mirror | 目标仍保持 upstream 相同路径，正常 Git merge 后回归 |
| A | Adapt | 目标路径保留，但调用 seam 已变化；合并后人工适配 |
| S | Split | 一个 upstream 模块已拆到多个目标 Module，按映射逐处移植 |
| D | Donor | Polaris-only 能力；提取行为、contract 和测试，不合并仓库历史 |
| T | Target-owned | 目标新模块；upstream 不可覆盖，只消费其变化 |
| R | Retired | 目标已删除的旧实现；只检查是否出现新兼容行为 |

## 3. Sim2 应用级对齐

| Sim2 upstream | 目标路径 | 策略 | upstream 更新后的动作 | 验证 |
| --- | --- | --- | --- | --- |
| `apps/sim/app/(auth)` | `apps/sim/app/(auth)` | A | 合并页面；服务端数据访问改走 API client | auth E2E、bundle guard |
| `apps/sim/app/(interfaces)` | `apps/sim/app/(interfaces)` | A | 合并页面与 layout；检查是否引入运行时 registry | route smoke、import graph |
| `apps/sim/app/(landing)` | `apps/sim/app/(landing)` | M | 正常合并静态/公开页面 | render smoke |
| `apps/sim/app/account` | `apps/sim/app/account` | A | 合并 UI；数据读写改走独立 API | contract、auth |
| `apps/sim/app/auth` | `apps/sim/app/auth` | A | 保留 Web callback/page；鉴权实现对齐 `packages/auth` | OAuth/session E2E |
| `apps/sim/app/f` | `apps/sim/app/f` | A | 合并公开文件 UI；文件传输仍由 API | public/file E2E |
| `apps/sim/app/invite` | `apps/sim/app/invite` | A | 合并页面；accept/query 改走 API | invite E2E |
| `apps/sim/app/organization` | `apps/sim/app/organization` | A | 合并 UI；Identity/Access 由 Biz Module 提供 | RBAC E2E |
| `apps/sim/app/playground` | `apps/sim/app/playground` | A | 合并 UI；执行请求进入 Worker | execution E2E |
| `apps/sim/app/workspace` | `apps/sim/app/workspace` | A | 合并画布 UI；禁止恢复浏览器 Executor | canvas/replay E2E |
| `apps/sim/app/api/**` | `apps/api/src/**` + `apps/sim/app/api/**` compat facade | S | 用 API inventory 定位目标；新行为先入 contract，再加兼容代理 | contract/differential |
| `apps/sim/app/api/environment`、`health`、`status` | `apps/api/src/modules/environment|system|status` + 原路径 proxy facade | S | W1 已迁移；upstream 行为变化先更新 API contract/adapter，再更新 differential fixture，禁止恢复旧实现 import | W1 C/D/I/P、facade bundle |
| `apps/sim/background` | `apps/worker/src/jobs` | S | Trigger.dev 任务变化移植到对应 job | job contract、retry |
| `apps/sim/components` | `apps/sim/components` 或 `apps/sim/features/*/components` | A | 通用 UI 同路径合并；业务 UI 进入 feature | visual/component |
| `apps/sim/hooks` | `apps/sim/hooks` | A | 合并 hook；所有服务端状态必须走 API contract | hook、contract |
| `apps/sim/stores` | `apps/sim/stores` | A | 合并 UI 状态；拒绝 Executor/credential/snapshot | store、import guard |
| `apps/sim/content` | `apps/sim/content` | M | 正常合并 | content build |
| `apps/sim/public` | `apps/sim/public` | M | 正常合并 | asset check |
| `apps/sim/scripts` | `scripts/migration` 或原路径 | A | app-local 脚本按职责移动；构建脚本保持兼容 | script smoke |
| `apps/desktop` | `apps/desktop` | M | 保留 Sim2 Desktop 能力和协议 | desktop unit/E2E |
| `apps/docs` | `apps/docs` | M | 正常合并 Sim2 文档站 | docs build |
| `apps/pii` | `apps/pii` | M | 正常合并 Python PII sidecar | Python tests |
| `apps/realtime` | `apps/realtime` | A | 合并协作协议；仍禁止 runtime/executor import | realtime tests、prune graph |

## 4. Sim2 `apps/sim` 模块对齐

| Sim2 upstream | 目标路径 | 策略 | 变化处理 |
| --- | --- | --- | --- |
| `apps/sim/blocks/registry-maps.ts` + BlockConfig metadata | `packages/tool-catalog/generated/browser-summary.json` + `generated/providers/*` | S | 运行 AST 生成器，比较稳定 block/tool ID、legacy alias 与 manifest hash |
| `apps/sim/blocks` UI | `apps/sim/features/workflow-canvas/blocks` | S | 只移植浏览器渲染与编辑行为 |
| `apps/sim/blocks` runtime | `apps/worker/src/runtime/blocks` | S | 移植执行绑定，禁止 Web import |
| `apps/sim/tools` metadata | `packages/tool-catalog/generated/providers/*` | S | 由 BlockConfig capability 提取，重新生成并运行 231 项 UI differential check |
| `apps/sim/tools` runtime | `apps/worker/src/runtime/providers/*` + `extensions/infra/*` | S | 按 Provider 适配，保留稳定 tool ID；首个 Notion add-database-row 已迁移，legacy ID 指向 v2 canonical ID |
| `apps/sim/triggers` metadata | `packages/tool-catalog/generated/providers/*`（后续扩展 trigger kind） | S | 保留稳定 trigger ID；Ticket 06 前不允许浏览器读取 runtime trigger registry |
| `apps/sim/triggers` runtime | `apps/worker/src/runtime/triggers` + `apps/api/src/modules/webhooks` | S | 执行在 Worker，公网 admission 在 API |
| `apps/sim/executor` | `apps/worker/src/execution` | S | 移植执行语义、snapshot、resume、cancel |
| `apps/sim/sandbox-tasks` | `apps/worker/src/sandbox` | S | 移植任务；通过 SandboxExecution interface |
| `apps/sim/serializer` | `packages/workflow-types/src/serialization` | S | 保持历史 workflow wire compatibility |
| `apps/sim/connectors` | `extensions/infra/*` + `apps/worker/src/runtime/integrations` | S | 按 Provider 映射到 adapter/loader |
| `apps/sim/providers` | `extensions/infra/llm-providers` | S | Provider SDK、凭证、重试留在 Infra |
| `apps/sim/enrichments` | `apps/worker/src/jobs/integration-task` + Infra | S | 查询 admission 与 Provider 执行分开 |
| `apps/sim/emails` | `apps/worker/src/jobs/notifications/templates` | S | 邮件模板和发送进入后端 |
| `apps/sim/ee` | Web/API/Worker 对应 Module | S | 先按文件 import graph 分类，禁止整目录复制 |
| `apps/sim/types` | `packages/api-contracts`、`execution-contracts` 或 `workflow-types` | S | 按数据所有者拆分，不建全局 types barrel |

## 5. Sim2 `lib` 对齐

| Sim2 upstream | 目标路径 | 策略 |
| --- | --- | --- |
| `apps/sim/lib/api/contracts` | `packages/api-contracts/src` | S |
| `apps/sim/lib/api/client` | `apps/sim/lib/api-client` | A |
| `apps/sim/lib/api/server` | `apps/api/src/transport/http` | S |
| `apps/sim/lib/auth` | `apps/api/src/modules/auth` + `packages/auth` | S |
| `apps/sim/lib/credentials` | `apps/api/src/modules/credentials` + `packages/runtime-secrets` | S |
| `apps/sim/lib/db` | `packages/db` + API repository adapters | S |
| `apps/sim/lib/execution` | `apps/worker/src/execution` | S |
| `apps/sim/lib/workflows` query/definition | `apps/api/src/modules/workflows` | S |
| `apps/sim/lib/workflows` runtime | `apps/worker/src/execution` | S |
| `apps/sim/lib/logs` write path | `apps/worker/src/execution/events` | S |
| `apps/sim/lib/logs` query/projection | `apps/api/src/modules/logs` | S |
| `apps/sim/lib/integrations` | `extensions/infra/*` | S |
| `apps/sim/lib/webhooks` | `apps/api/src/modules/webhooks` + Worker trigger runtime | S |
| `apps/sim/lib/mcp` | `apps/api/src/modules/mcp` + Worker runtime | S |
| `apps/sim/lib/copilot` | `apps/api/src/modules/copilot` + Worker jobs | S |
| `apps/sim/lib/files`, `uploads`, `workspace-files` | `apps/api/src/modules/files` + object-storage adapter | S |
| `apps/sim/lib/knowledge`, `search`, `chunkers` | API knowledge Module + vector/content Infra | S |
| `apps/sim/lib/organizations`, `users`, `permissions` | API transport + Identity Biz | S |
| `apps/sim/lib/approvals` | API transport + Approval Biz | S |
| `apps/sim/lib/events`, `workspace-events` | API/Worker event modules + Operations Biz | S |
| `apps/sim/lib/billing` | `apps/api/src/modules/billing` | S |
| `apps/sim/lib/table` | `apps/api/src/modules/table` | S |
| `apps/sim/lib/core`, `environment`, `monitoring` | API/Worker/Web 各自本地实现或纯 package | A |
| 其他浏览器纯函数目录 | `apps/sim/lib/browser` 或保持原路径 | A |

对 `apps/sim/lib/**` 的每次 upstream 变化先运行 import graph 分类。不能仅凭目录名判断运行
环境；同一个旧目录可能同时包含 Web、API 和 Worker 代码。

## 6. Sim2 package 对齐

以下 package 全部保持同路径，策略为 M；upstream 更新后正常 merge，并运行各 package 测试：

| 同路径 package |
| --- |
| `packages/audit` |
| `packages/auth` |
| `packages/browser-protocol` |
| `packages/cli` |
| `packages/db` |
| `packages/desktop-bridge` |
| `packages/emcn` |
| `packages/logger` |
| `packages/platform-authz` |
| `packages/python-sdk` |
| `packages/realtime-protocol` |
| `packages/runtime-secrets` |
| `packages/security` |
| `packages/terminal-protocol` |
| `packages/testing` |
| `packages/ts-sdk` |
| `packages/tsconfig` |
| `packages/utils` |
| `packages/workflow-persistence` |
| `packages/workflow-renderer` |
| `packages/workflow-types` |

目标新增 `api-contracts`、`execution-contracts`、`tool-catalog`、`polaris-extension-sdk` 为 T。
upstream 不能覆盖，但 upstream contract/type 变化必须通过本表的 S 映射吸收。

## 7. Polaris 能力迁移表

| Polaris donor | 目标 Module/路径 | 策略 | 迁移内容 | 禁止做法 |
| --- | --- | --- | --- | --- |
| `lib/polaris/identity` | `extensions/biz/identity` | D | Person/Org/ExternalIdentity/Role/MenuGrant/DataScope | 保留 Feishu SDK import |
| `lib/polaris/pm` | `extensions/biz/pm` | D | Project/Membership/Stage/Document/Context/MAT/WorkflowBinding | PM 直接获取 Meegle client |
| `lib/polaris/hr` | `extensions/biz/hr` | D | OffboardingCase/Step/Artifact/Signature/HR Todo | HR 调用 Feishu server runner |
| `lib/polaris/delivery` | `extensions/biz/delivery` | D | Assignment/Todo/NotificationPolicy/Receipt | 直接发送 Feishu 消息 |
| `lib/polaris/approvals` | `extensions/biz/approval` | D | Definition/Instance/Decision/WaitSubscription | Provider ID 成为业务主键 |
| `lib/polaris/risks` | `extensions/biz/risk` | D | Risk/RuleSet/Simulation/Schedule | 把通知 transport 写入规则 |
| `lib/polaris/operations` | `extensions/biz/operations` | D | Release/Schedule/SyncJob/OperationRun | 把 Provider client 当业务 Module |
| `lib/polaris/events` | Operations/Delivery application layer | D | event log、notification orchestration | 新建第二套通用 event framework |
| `lib/polaris/channels` | Biz channel use case + Feishu Infra | D/S | mailbox、wait subscription、route、idempotency | 将 Feishu normalization 留在 Biz |
| `lib/polaris/integrations/feishu` | `extensions/infra/feishu-channel` | D | auth/directory/message/approval/doc/webhook | 复制到每个 Biz |
| `instrumentation-node.ts` + `lib/polaris/integrations/feishu/ws-trigger.ts` | `extensions/infra/feishu-channel/src/triggers` + `apps/worker/src/ingress/feishu-persistent-connection` | D/S | Node WSClient、credential reconcile、连接健康、事件归一化和 job admission | 继续挂在 Next instrumentation，或直接 import Executor/Sandbox |
| `tools/feishu`, Feishu blocks/triggers | Feishu Infra + Catalog + Worker runtime | D/S | 全部 Feishu runtime 与 metadata | Web 导入 server runner |
| `lib/polaris/integrations/meegle` | `extensions/infra/meegle-connector` | D | auth/client/capability/hierarchy/errors | 放回 `biz/pm/meegle` |
| `lib/polaris/delivery/meegle` | Meegle Infra + PM policy + Operations SyncJob | D/S | 拆 transport、mapping、orchestration | 整目录搬迁 |
| `packages/feishu-channel` | `extensions/infra/feishu-channel` | D | 复用已测试 client/normalization | 再造重复 client |
| `packages/meegle-connector` | `extensions/infra/meegle-connector` | D | 复用 client/transport/types/tests | Biz 导入 concrete package |
| `packages/polaris-extension-sdk` | `packages/polaris-extension-sdk` | D | 从首个真实 adapter 提取最小生命周期 | 先设计巨型 SDK |
| `lib/execution/isolated-vm.ts` + `isolated-vm-worker.cjs` | `apps/worker/src/sandbox/isolated-vm` | S | Node child process、native ABI、pool、broker、取消与资源限制 | 用 Bun 直接加载 isolated-vm native worker |
| `components/polaris/access` | `apps/sim/features/administration` | D | Access UI | UI 定义授权真相 |
| `components/polaris/pm` | `apps/sim/features/pm` | D | PM UI | 直接 import Biz repository/Infra |
| `components/polaris/hr` | `apps/sim/features/hr` | D | HR UI | 直接 import Feishu/DB |
| `lib/api/contracts/polaris` | `packages/api-contracts/src/polaris` | D | PM/HR 等 wire contract | Route/client 重复 schema |
| `app/api/polaris/**` | API transport +对应 Biz Module | D | 23 条 event/notification/risk/todo Route | 业务逻辑留在 handler |
| `app/api/workspaces/[id]/pm/**` | API transport + PM/其他 Biz | D | 52 条 W8 PM Route | 用 URL 层级决定内部所有权 |
| `app/api/workspaces/[id]/hr/**` | API transport + HR Biz | D | 9 条 W8 + 3 条 W3 文件 Route | 文件逻辑复制进 HR |
| Replay/Debug projection/routes/UI | API Replay Module + Worker + Web feature | D/S | failed runs、safe/live、step、continue | 浏览器保存 Executor |
| `apps/content-processor` | `apps/content-processor` | D | MarkItDown 与 vision extraction sidecar | 合并进 Web 进程 |
| `apps/mothership` | API Copilot Module + Worker | D/S | model/chat/stream/resume/abort/MAT chat | 将 Go 服务直接当目标后端 |
| `apps/operations-agent` | Operations Biz + Worker | D/S | task、gate、release、rollback、test | 保留第二套业务状态真相 |

## 8. 定期同步流程

每次同步只在独立分支执行：

```text
sync/sim-main-YYYYMMDD
```

流程：

1. 读取 `upstream-sync-state.json` 的 `lastSyncedCommit`；
2. `git fetch origin main`；
3. 生成 `lastSyncedCommit..origin/main` 的 changed paths；
4. 用本文档将变化分为 M/A/S/R；
5. 先 merge upstream，保留 Git 的 rename/merge 证据；
6. M 直接回归，A 修正 seam，S 按目标 Module 逐项移植；
7. 对 API 变化更新 API inventory；
8. 对 Tool/Block/Trigger 变化重生成 Catalog，并跑历史 ID 兼容测试；
9. 运行受影响 Module 测试、import graph、bundle budget 和关键 E2E；
10. 更新 `lastSyncedCommit`，提交一份同步报告。

同步报告必须列出：

- upstream commit range；
- changed paths；
- 命中的映射行；
- 已移植目标；
- 明确忽略项及原因；
- contract/schema/DB migration 变化；
- 测试与性能结果；
- 未解决冲突和回滚点。

## 9. 冲突优先级

发生冲突时按以下顺序保护行为：

1. 稳定 Tool/Block/Trigger ID 和历史 workflow wire compatibility；
2. Auth、授权、租户隔离、凭证与审计；
3. API wire contract 与状态码；
4. Worker 执行、重试、取消、恢复和 Sandbox 清理；
5. Polaris Biz 领域状态机；
6. UI 与样式；
7. 内部文件布局。

不得为了让 upstream merge “看起来干净”而重新引入 Web -> Runtime Registry、Biz -> Infra
具体实现或浏览器 Executor。

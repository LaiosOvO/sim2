# Polaris 核心迁移执行交接

更新时间：2026-07-30

## 当前检查点

- 分支：`codex/frontend-backend-refactor`
- 起始提交：`7d4569bdc940`
- 全量严格验收：34/1126（3.0%）
- Polaris Biz W8：0/109 正式验收；Approval 8 条处于整改状态
- 非核心 Route 继续使用 server-only legacy facade，不阻塞核心切流

## 目标

优先完成 Polaris 当前业务所需能力和前端提速，不以 1,126 Route 全量原生化作为近期
完成条件。浏览器只依赖版本化契约、轻量 query 和安全状态投影；鉴权、租户、状态机、
幂等、Provider、Executor 与 Sandbox 实现全部隐藏在后端深 Module 后面。

## 执行顺序

### H1：冻结当前执行链

1. 完成 W6 API-0138/API-0283/API-0993 最终独立复审。
2. 批准后更新 accepted ledger、进度文档、证据哈希并提交。
3. 保持 API/Worker、Infra Extension 的浏览器闭包为 0。

验收：真实 PostgreSQL、真实 HTTP、固定查询预算、Worker 状态推进、对象存储读取、
类型检查、构建、strict validation、browser closure 全绿。

### H2：Approval

完成现有 8 条 Approval Route 的剩余整改：

- resume claim、stale/failed/reconcile 和并发 fencing；
- effect outbox 事务入列与幂等键；
- API→Worker→执行接收端真实 HTTP 闭环与 readiness；
- 跨 workspace/organization hostile PostgreSQL fixture；
- donor 差分、完整门禁和独立复审。

Approval 未获得 reviewer `approved` 前不得进入完成账本。

### H3：Identity/Access

迁移 16 条 Person、Organization、ExternalIdentity、Role、Menu、DataScope Route。
Feishu ID 只能作为 opaque external identifier；Identity Biz 不得导入 Feishu SDK。

### H4：PM 与 Meegle

迁移 52 条 Project、Membership、Stage、Document、Context、MAT、WorkflowBinding Route。

- PM Biz 拥有业务状态和映射意图；
- Meegle Infra Adapter 拥有 OAuth、transport、分页、限流、重试和 Provider ID；
- Operations Biz 拥有 SyncJob、attempt、审计和 replay。

禁止 PM 直接获取 Meegle client。

### H5：HR、Delivery 与 Feishu

迁移 HR 9 条业务 Route 和相关 3 条文件 Route，再迁移
Delivery/Operations/Risk/Event 23 条及 MAT chat 1 条。

建立 Node `feishu-ingress`：

- 只负责长连接、credential reconcile、事件归一化、幂等 ingress job 和 readiness；
- 不导入 Executor 或 Sandbox；
- HR、PM、Approval、Delivery 只依赖 capability Interface，不导入 Feishu 实现。

### H6：Sandbox 与 Replay/Debug

- 完成 Node Sandbox 生产 Adapter、取消、超时、资源限制和执行恢复。
- 建立服务端 Replay/Debug Session、step/continue/cancel、SSE cursor 补发和安全投影。
- Web 只保存 `debugSessionId`、当前节点、状态投影和 event cursor，不持有 Executor。

### H7：前端体验与切流

1. 按 Polaris 真实页面逐条切断 Executor、Registry、DB/Auth、Provider SDK 可达链。
2. 记录冷编译、增量编译、页面首开、bundle 和 client closure。
3. 完成 E2E、灰度路由、观测、回滚和旧实现删除条件。

目标：热请求小于 1 秒，核心页面冷启动小于 10 秒，并持续降低旧重依赖 client roots。

## 暂缓范围

- 555 条 Tool Adapter 全量原生化；
- 与 Polaris 当前页面无关的 Sim2 CRUD、Provider 和管理 Route；
- Go 重写、Bun 生产运行时、精确历史 revision replay；
- 尚无第二个真实 Adapter 的通用插件框架。

## 工期

| 交付目标 | 工程量 | 并行日历时间 |
|---|---:|---:|
| 前端热路径提速 | 15–25 人日 | 2–4 周 |
| Polaris 核心内部可用 | 45–70 人日 | 6–9 周 |
| Polaris 核心生产切流 | 70–100 人日 | 9–14 周 |

按 Biz、Execution/Infra、Web/Cutover 三个并行流估算；串行实施约需 4–6 个月。

## 每个批次的提交规则

1. 实现 agent 冻结源码并提交作者侧测试证据。
2. 未参与实现的 agent 独立审查。
3. reviewer 明确 `approved` 后才能更新 accepted ledger。
4. 运行类型检查、focused/full tests、真实 I/O、strict validation 和浏览器门禁。
5. 更新 handoff、review、迁移对齐表和进度文档。
6. 创建可回滚 commit，并立即 push 到远端分支。

详细范围依据：[Polaris 核心范围与工期](../goals/polaris-core-scope-and-estimate.md)。

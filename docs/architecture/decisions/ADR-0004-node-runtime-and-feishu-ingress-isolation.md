# ADR-0004：Node 生产运行时与飞书长连接隔离

- 状态：Accepted
- 日期：2026-07-30
- 范围：Web、API、Worker、Feishu Persistent Connection、Sandbox

## Context

Polaris 的开发命令表面上从 `bun run dev` 启动，但脚本实际用
`node --import tsx` 运行，并由 Node 启动 Next。生产镜像也按 Node ABI 重编译
`isolated-vm`，最终以 Node 启动。

飞书 Bot 长连接由 Next 的 `instrumentation-node.ts` 创建。连接 handler 本身不使用
Sandbox，但会直接调用 webhook processor，后者可进入 workflow execution。这使连接管理、
Web 请求、Executor 与 Sandbox 形成同进程故障域和导入闭包。Web 健康不代表 Bot 已连接，
Sandbox/Executor 压力也可能影响长连接。

本地代码 Sandbox 还明确要求 Node：宿主检查 `node --version`，再用
`node --no-node-snapshot` 启动 `isolated-vm-worker.cjs`。强行改为 Bun 会引入 native ABI、
IPC 和 V8 行为风险，且对前端编译问题没有帮助。

## Decision

1. Bun 是 monorepo 的 package manager、script runner、build tool 和 test launcher。
2. Next Web、独立 API、Worker、飞书 persistent connection 与 local Sandbox 的生产
   runtime 固定为 Node.js 22.19+。
3. `apps/worker` 的同一构建产物提供独立 deployment role：
   - `execution`：Executor、Runtime Registry、Sandbox 和执行 jobs；
   - `feishu-ingress`：WSClient、credential reconcile、connection health、event
     normalization、dedupe 与 job admission。
4. `feishu-ingress` 通过 `extensions/infra/feishu-channel/src/triggers` 的小 interface
   使用连接 Module；不得 import Executor、Runtime Registry、Sandbox 或 Next。
5. 飞书事件进入 durable inbox/job 后才交给 workflow execution。卡片动作在飞书时限内
   只等待 durable claim/queue acknowledgement。
6. Web/API、Feishu ingress、Execution Worker 和 Sandbox 使用独立 readiness、指标、
   扩缩容与回滚开关。
7. local isolated-vm adapter 继续使用 Node child process；E2B/Daytona 镜像显式 pin
   兼容 Node 版本。

## Interface and adapters

连接 Module 的 interface 只暴露：

- `start()` / `stop()` 生命周期；
- `reconcile()` 凭证目标对账；
- `status()` 脱敏连接状态；
- 归一化事件提交 callback。

生产 adapter 使用 Lark Node SDK、数据库 credential source 与 durable job sink。测试
adapter 使用 fake credential source、fake WS client 和 in-memory job sink。调用者不需要
知道 Lark payload、重连 timer、Executor 或 Sandbox。

## Consequences

- 不能再用 `bun run ...` 的外层命令推断生产 runtime。
- API/Worker Dockerfile、Helm command、runtime smoke test 必须明确执行 `node`。
- 飞书连接可以独立滚动和扩缩容；必须通过租约或 leader election 保证同一 credential
  只有受控消费者。
- Web/API 正常而飞书离线时，readiness 与告警会明确区分故障域。
- Sandbox 的 Node/native 约束被收口到后端，不影响浏览器 bundle。

## Rejected alternatives

- 让飞书长连接继续由 Next instrumentation 托管：保留了错误故障域与执行闭包。
- 让 Feishu ingress 与 Sandbox 共用一个 Worker role：无法独立扩缩容和判定健康。
- 为统一技术栈而强制 Bun 运行 isolated-vm：收益不足以覆盖 native ABI 与 V8 风险。
- 立即新增一个独立 app：当前同一 Worker 构建产物的 role 已能形成部署 seam；若未来运维
  数据证明需要不同发布周期，再通过 ADR 拆成独立 app。

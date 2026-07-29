# Phase 3 Worker Job 与 Sandbox 骨架检查点

> 日期：2026-07-30
> Ticket：08
> 状态：实现完成，等待提交

## 结果

已经建立可由 Node 构建产物真实运行的执行链：

```text
API /internal/execution/jobs
  -> HTTP WorkerJobSubmitter
  -> execution Worker /internal/jobs
  -> delivery coordinator
  -> HTTP Sandbox adapter
  -> sandbox Worker role /internal/sandbox/execute
  -> ordered execution events
```

本机 smoke 使用三个独立 Node 进程启动 API、execution Worker 与 Sandbox role，提交
version 1 的 restricted test job，最终观察到 `started -> completed`。

## Contract

`@sim/execution-contracts/job-control` 新增：

- job admission response；
- cancellation request/response；
- Sandbox resource policy；
- restricted test payload；
- Sandbox execution command/result/failure。

Sandbox policy 的 wire boundary 固定：

- `network = deny`；
- filesystem 只能是 ephemeral，read-only mounts 与 writable root 显式声明；
- CPU、memory、wall-clock 与 input bytes 都有上限；
- secret 只能传 `credentialRefs`，`values` 等明文字段由 strict schema 拒绝。

生成后的 Platform Contract 共 29 个 schema。API 与 Web 只看到版本化数据，不 export
Sandbox adapter、queue、state store 或 provider runtime。

## Delivery coordinator

Worker application 的窄接口是：

- `start/stop/status/ready`；
- `submitJob`；
- `cancelExecution`；
- `executionEvents`；
- 既有 `executeToolJob`。

Coordinator 内部处理：

- delivery claim 与 job ID 幂等；
- 单调 event sequence；
- transient retry 与退避；
- retry exhaustion dead letter；
- active/queued cancel；
- wall-clock timeout；
- poison contract dead letter；
- completed/failed/cancelled/dead-lettered 终态。

当前 queue、state 与 event journal 是可替换的内存 adapter，用来证明状态机和 HTTP seam。
它们不是生产 durable queue，也不能作为正式流量切换条件。后续 Redis/Trigger.dev/数据库
adapter 必须实现相同 ports，并补充进程崩溃、lease 过期与恢复测试。

## Sandbox

Ticket 08 的 restricted adapter 不执行任意 JavaScript，只支持：

- `echo`；
- `delay`；
- `transient-failure`；
- `fatal-failure`。

它实际执行 input byte、wall-clock、cancel 与 retry 检查；network/filesystem/secret value
能力根本没有暴露。CPU/memory 是已验证的 policy budget，但真实资源隔离要由下一阶段的
isolated-vm/E2B/Daytona adapter 落实。

同一 `@sim/worker` split build 提供：

- `--role=execution` / `start`，默认端口 3003；
- `--role=sandbox` / `start:sandbox`，默认端口 3004。

两者有独立 liveness/readiness；execution role 可通过 `SANDBOX_SERVICE_URL` 使用远端
Sandbox。restricted adapter 默认 fail-closed，只有显式设置
`ENABLE_RESTRICTED_TEST_SANDBOX=1` 才能启用；否则 readiness 为 503。Sandbox role 单独
构建的闭包为 87,228 gzip bytes，Runtime Registry、Notion
Provider、execution coordinator 与飞书 SDK marker 为 0。

## Node/Bun 决策

- API、execution Worker 与 Sandbox role 的 smoke 都执行 `node dist/index.js`。
- `apps/worker` 的 `start` 与 `start:sandbox` 都由结构门禁检查必须以 `node` 开头。
- Bun 继续负责 install、build、test 与 smoke orchestration，不是生产进程 runtime。
- 本地 isolated-vm 未来仍由 Node child process 承载；不会尝试在 Bun 进程内加载 native
  addon。

## 验证证据

| Gate | 结果 |
| --- | --- |
| API tests | 11/11 |
| Worker tests | 17/17 |
| Execution contract tests | 6/6 |
| API/Worker/contract type-check | 通过 |
| API split build entry | 18.20 KiB |
| Worker split build entry | 1.00 KiB |
| Sandbox isolated build | 87,228 gzip bytes |
| Worker role isolation | forbidden marker 0 |
| Node execution spine | API -> Worker -> Sandbox -> completed |
| Contract generation | 29 schemas，clean |

`1.00 KiB` 是 split build 标记的 Worker entry file，不等于完整启动闭包或进程内存；启动时
还会读取 shared logger/contract chunks。角色隔离以独立 role build 的传递闭包检查为准。
全浏览器传递闭包复核后，`api-or-worker` 仍为 0。

## 尚未完成

- 真实 isolated-vm adapter 与现有 `isolated-vm-worker.cjs` 迁移；
- production durable queue、lease、crash recovery 与横向扩容；
- DB-backed execution event/state 查询；
- E2B/Daytona contract adapter；
- 真正 CPU/memory/native isolate 限制与容器级 seccomp/cgroup 验收；
- W6 现有执行、Replay/Debug、暂停/恢复/取消接口切流。

这些是后续 Ticket 的明确输入，不能把当前 restricted adapter 描述成生产沙箱迁移完成。

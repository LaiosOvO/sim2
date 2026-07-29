# 飞书长连接、Sandbox 与 Node/Bun 运行时审计

Status: audited; architecture decision frozen in ADR-0004

## 用户问题

Polaris 使用飞书 Bot 长连接，并且长连接看起来与 Node Sandbox 有关。确认当前服务是否不能
用 Bun 运行，以及重构后是否需要改变运行时或实现。

## 代码证据

Polaris 的飞书长连接由 `apps/sim/instrumentation-node.ts` 在 Next Node runtime 启动。
连接 Module 本身不执行用户代码，但其静态 import graph 是：

```text
instrumentation-node.ts
  -> lib/polaris/integrations/feishu/ws-trigger.ts
  -> lib/webhooks/processor.ts
  -> background/webhook-execution.ts
  -> lib/workflows/executor/execution-core.ts
  -> executor/execution/executor.ts
  -> executor/orchestrators/loop.ts
  -> lib/execution/isolated-vm.ts
```

因此飞书不是 Sandbox capability，但当前导入边界把长连接、Webhook admission、Executor 和
Sandbox 放进同一个服务端模块图及故障域。

`apps/sim/package.json` 的默认开发命令是
`node --import tsx scripts/dev-node.ts`。从根目录执行 `bun run dev` 时，Bun 只是 package
script runner；Next 的真实 runtime 仍是 Node。

Sandbox 宿主会检查 `node --version`，并显式执行：

```text
node --no-node-snapshot isolated-vm-worker.cjs
```

## 2026-07-30 本机探针

环境：

- Node.js `v22.20.0`
- Bun `1.3.11`
- `isolated-vm` `6.0.2`

结果：

- Node 加载 `isolated-vm` 成功，`Isolate` 是 constructor。
- Bun 加载同一 native addon 失败：安装产物使用
  `NODE_MODULE_VERSION 127`，Bun 兼容层要求 `NODE_MODULE_VERSION 137`。
- Node 与 Bun 都能导入 `@larksuiteoapi/node-sdk`，构造 `WSClient`、读取 `idle` 状态并关闭。
  该构造级探针不代表 Bun 已通过真实长连接、自动重连、TLS、代理和信号处理的生产验收。

## 结论

1. “当前服务不能直接以 Bun 作为生产 runtime”成立，但根因不是飞书 SDK；确定性阻断来自
   `isolated-vm` native ABI，以及现有 Next/worker/standalone 全部按 Node 验收。
2. 不把 API、飞书长连接或 Sandbox 改成 Bun。目标生产 runtime 继续固定为 Node.js
   22.19+；Bun 保留在 install、build、test launcher 和 scripts。
3. 后续必须改的是模块和进程 seam：
   - `feishu-ingress` role 只拥有 WSClient、credential reconcile、连接健康、事件归一化、
     去重和 durable admission；
   - `execution` role 消费 job 后才加载 Executor 与 Runtime Registry；
   - `sandbox` role 通过 `SandboxExecution` interface 提供 isolated-vm/E2B/Daytona adapter；
   - 三个 role 不共享 readiness、扩缩容或重启故障域。
4. 不能把当前 880 行 `ws-trigger.ts` 原样搬入 Worker。它混合连接生命周期、消息触发、
   审批、channel wait、身份解析和 workflow dispatch；迁移时要通过窄 interface 组合。
5. 卡片回调必须在飞书三秒窗口内完成 durable claim/queue acknowledgement，真实 workflow
   execution 异步继续。多副本需要 lease/leader election，保证每个 credential 只有受控
   长连接消费者。

## 迁移落点

- ADR：`docs/architecture/decisions/ADR-0004-node-runtime-and-feishu-ingress-isolation.md`
- 正式 Spec：`docs/specs/sim2-platform-separation-and-polaris-migration.md`
- Feishu/Meegle Ticket：
  `.scratch/sim2-platform-separation/issues/36-feishu-meegle-infra-adapters.md`
- Sandbox Ticket：
  `.scratch/sim2-platform-separation/issues/31-w6-resume-pause-and-sandbox.md`

当前 `apps/worker` 只有 `execution` 与 `sandbox` skeleton，尚未实现 `feishu-ingress` role；
这项工作属于 Ticket 36，不应在当前 W2 read API 阶段把 donor coordinator 提前复制过来。

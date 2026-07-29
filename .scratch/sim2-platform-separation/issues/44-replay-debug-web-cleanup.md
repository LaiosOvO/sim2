# 清理 Replay/Debug Web 执行闭包

What to build: 将画布 Replay/Debug UI 改为纯 contract client 与 server projection 消费者。
Blocked by: 05, 43
Status: ready-for-agent

## What to build

移除 UI 对 `executeWorkflowWithFullLogging`、Executor types/instance、Runtime Registry 和 `SerializableExecutionState` 重建逻辑的导入。

## Acceptance criteria

- Web store 只保存 session ID、projection、cursor、UI selection 与 draft hash。
- step/continue/cancel 都是幂等 API command，不调用浏览器内 Executor。
- refresh/reconnect/冲突/过期 UI 与 normal run/replay/debug E2E 通过。
- Replay 页面 bundle 中 Executor、Runtime Registry、Provider SDK、Sandbox 为 0。
- 页面交互首开/增量编译与内存达到 Spec 门槛。

## Blocked by

05、43。

# 建立服务端权威 Replay/Debug Session

What to build: 将 Replay/Debug 的 Executor 与 execution state 移到 API/Worker，Web 仅持有 session/projection/cursor。
Blocked by: 29, 30, 31
Status: ready-for-agent

## What to build

冻结 API-0983/0984/0991/0994 行为，新增 versioned Debug Session repository、TTL、draft hash、幂等 command、lock 与 event projection。

## Acceptance criteria

- start/replay-from-block/breakpoint/step/continue/cancel/refresh recovery/expiry/version conflict/duplicate command 全覆盖。
- safe replay 与 live replay 权限、确认、审计和副作用策略明确并测试。
- API-0983/0984/0991/0994 的旧 wire contract differential tests 通过。
- Worker 重启、stream reconnect、乱序/重复事件与 recursive trace golden fixtures 通过。
- Stream Replay、Channel Event Replay、Execution Replay 指标与模型分开。

## Blocked by

29、30、31。

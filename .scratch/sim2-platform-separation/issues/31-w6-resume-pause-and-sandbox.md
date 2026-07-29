# 迁移 W6 Resume、Pause 与 Sandbox 执行

What to build: 迁移 API-0281/0282/0283/0996/0997 共 5 条，并完成生产级 Sandbox 集成。
Blocked by: 08, 30
Status: ready-for-agent

## What to build

把暂停上下文、恢复命令、轮询和 Sandbox 生命周期收口到 Worker；API 暴露投影与幂等命令。

## Acceptance criteria

- 五个 ID 精确覆盖 W6 剩余接口；与 Ticket 30 合并恰为 11 条。
- pause/resume 重复投递、版本冲突、过期、取消、Worker 重启恢复有测试。
- Sandbox 限权、资源预算、网络策略、secret、产物上传与清理测试通过。
- W6 全量 C/A/D/I/E/P/R/S 及适用 B 测试通过。

## Blocked by

08、30。

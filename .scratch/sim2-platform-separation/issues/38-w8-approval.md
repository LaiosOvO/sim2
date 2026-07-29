# 迁移 W8.3 Approval

What to build: 迁移 W8 Approval 子波次的 8 条路由与定义、实例、决策、等待订阅。
Blocked by: 35, 36
Status: ready-for-agent

## What to build

Approval domain 通过 channel port 发送/接收，决策命令支持幂等与审计，并能恢复等待中的 workflow。

## Acceptance criteria

- selector 精确为 8 条。
- approve/reject/timeout/duplicate callback/late decision/permission 与 audit tests 通过。
- 不直接导入 Feishu SDK；恢复经 execution contract 调用 Worker。
- C/A/D/I/E/R/S 测试与 coverage report 通过。

## Blocked by

35、36。

# 迁移 W8.5 Delivery、Operations、Risk 与 Event

What to build: 迁移 W8 Delivery/Operations/Risk/Event 子波次的 23 条路由。
Blocked by: 35, 36, 37, 38, 39
Status: ready-for-agent

## What to build

覆盖 Todo、Notification、SyncJob、Schedule、Risk；Operations 拥有跨 Biz 的同步 job lifecycle，不拥有 PM 规则。

## Acceptance criteria

- selector 精确为 23 条。
- job state、retry、dedupe、schedule、notification、risk evaluation 和审计 fixture 兼容。
- 跨域调用经 application ports/events，不产生 Biz 循环依赖或直接 Infra import。
- C/A/D/I/E/R/S/P 测试通过。

## Blocked by

35、36、37、38、39。

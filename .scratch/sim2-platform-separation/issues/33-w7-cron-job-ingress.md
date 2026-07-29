# 迁移 W7 Cron 与定时 Job Ingress

What to build: 迁移 W7 中 cron 顶级领域的 11 条接口。
Blocked by: 08, 32
Status: ready-for-agent

## What to build

Cron HTTP 入口只验证调度签名并提交幂等 job；实际 cleanup/reconcile/renew/process 在 Worker 执行。

## Acceptance criteria

- selector 精确为 11 条。
- 签名、重复调度、并发锁、重试、超时、死信、补偿和审计测试通过。
- Polaris assignment/notification/risk cron 通过 Biz port 调用，不直接绑定具体 Feishu/Meegle。
- C/A/D/I/R/S 与调度性能测试通过。

## Blocked by

08、32。

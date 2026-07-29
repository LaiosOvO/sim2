# 迁移 W3 Copilot、Chat 与 Mothership 接口

What to build: 迁移 W3 中 copilot 20、chat 5、mothership 11，共 36 条。
Blocked by: 09, 14
Status: ready-for-agent

## What to build

将 Mothership 行为拆入 API orchestration 与 Worker job，不复制其旧聚合目录；流式 AI 调用使用后端 provider port。

## Acceptance criteria

- selector 精确命中 36 条。
- streaming/cancel/backpressure、provider error、usage、auth 和持久化测试通过。
- Web 只消费 stream/event contract，不导入 provider SDK、executor 或 registry。
- Polaris 与 Sim2 分叉行为逐条记录取舍并通过 differential/golden test。

## Blocked by

09、14。

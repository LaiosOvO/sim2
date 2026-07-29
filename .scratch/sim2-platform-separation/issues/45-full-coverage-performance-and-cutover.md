# 完成 1,126 API 全量闭环与生产切换

What to build: 合并 W1–W8 证据，完成全量回归、性能、安全、故障与灰度切换。
Blocked by: 07, 12, 19, 28, 29, 31, 34, 41, 42, 44
Status: ready-for-agent

## What to build

生成最终 coverage manifest；对旧 Next route 与新 API/Worker 做 differential/影子流量/渐进切换并按证据删除不再需要的服务实现。

## Acceptance criteria

- 1,126 个唯一 API 全部有 owner、target、contract、implementation、test evidence 与 cutover 状态。
- W1–W8 合集恰为 1,126，无重复、遗漏、未解释手工 route 或 orphan facade。
- Web 独立构建不编译 server tool system；关键页面编译、bundle、RSS、冷启动满足 Spec 门槛。
- 全量 unit/contract/integration/E2E/performance/security/reliability/chaos 测试通过。
- 灰度、观测、回滚演练通过后才关闭旧实现；数据/事件 schema 无兼容破坏。

## Blocked by

07、12、19、28、29、31、34、41、42、44。

# 迁移 W4 Provider T–Z 并关闭 W4

What to build: 迁移 provider slug 首字母 T–Z 的 40 条 W4 工具接口并完成 555 条闭环。
Blocked by: 21, 22, 23, 24, 25, 26, 27
Status: ready-for-agent

## What to build

完成最后一批生成/adapter 修复，合并八个批次 coverage manifest 并执行 W4 全量回归。

## Acceptance criteria

- 本批 selector 精确为 40 条。
- 八批合并后恰为 555 条、无重复、无遗漏、无未解释手工入口。
- 555 条的 contract/auth/differential 与适用 I/S/R 测试全部通过。
- Web/API bundle 不含完整 Runtime Registry/Provider SDK，Worker lazy-load 性能门槛通过。
- 旧入口保持可回滚，生成物 clean tree。

## Blocked by

21、22、23、24、25、26、27。

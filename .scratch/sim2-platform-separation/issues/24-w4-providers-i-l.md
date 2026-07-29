# 迁移 W4 Provider I–L

What to build: 迁移 provider slug 首字母 I–L 的 92 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

生成并接入 identity、issue/project 与数据类 provider adapter，保留全部历史 tool ID。

## Acceptance criteria

- selector 精确为 92 条。
- credential scope、分页、rate-limit、retry/idempotency 和错误映射测试通过。
- runtime registry 只加载被调用 provider；catalog metadata snapshot 一致。
- 本批所有清单测试与 provider 级切流/回滚通过。

## Blocked by

20。

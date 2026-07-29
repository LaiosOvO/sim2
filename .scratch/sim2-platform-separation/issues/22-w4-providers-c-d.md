# 迁移 W4 Provider C–D

What to build: 迁移 provider slug 首字母 C–D 的 124 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

使用 W4 生成器批量生成兼容入口，按 provider adapter 逐个完成 golden/differential 校验。

## Acceptance criteria

- selector 精确为 124 条且 provider manifest 无缺失。
- 所有工具的 schema、历史 ID、credential type 和错误语义兼容。
- Provider 网络失败、限流、重试与幂等路径通过测试。
- 本批切流可按 provider 回滚，不需回滚整个 W4。

## Blocked by

20。

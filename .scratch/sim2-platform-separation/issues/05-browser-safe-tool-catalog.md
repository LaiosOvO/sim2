# 提取浏览器安全 Tool Catalog

What to build: 把画布需要的工具 metadata 从大 Runtime Registry 中抽成可序列化、可分片的 Catalog。
Blocked by: 03, 04
Status: ready-for-agent

## What to build

定义 catalog DTO、构建器、版本/hash、按 provider/搜索条件读取接口，并迁移一个代表性画布消费者。

## Acceptance criteria

- Catalog 只含展示、输入描述、能力与版本 metadata，不含执行函数、鉴权、加密、SDK client 或 secrets。
- Catalog 构建输出稳定可缓存，支持按需分片和旧 tool ID。
- 代表性画布页面不再导入完整 tools/blocks/triggers registry。
- Bundle/import-graph 测试证明客户端不含 Executor、Runtime Registry 与 Provider SDK。
- Catalog snapshot 与现有 UI 可见工具 metadata 做 differential test。

## Blocked by

03、04。

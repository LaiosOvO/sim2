# 提取浏览器安全 Tool Catalog

What to build: 把画布需要的工具 metadata 从大 Runtime Registry 中抽成可序列化、可分片的 Catalog。
Blocked by: 03, 04
Status: completed

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

## Implementation evidence

- `scripts/catalog/generate-tool-catalog.ts` 使用 TypeScript AST 静态读取
  `apps/sim/blocks/registry-maps.ts` 及其直接 BlockConfig 声明，不执行或 import Runtime
  Registry、Provider SDK、鉴权、加密或 secrets；
- 生成 313 个 catalog item、280 个 provider 分片、一个 browser summary 和带稳定
  SHA-256 的 manifest；重复运行 `catalog:check` 可逐字节验证输出；
- 313 个 item 保留稳定 block/tool capability ID，并为 block slug、下划线/连字符形式生成
  legacy alias；
- 231 个现有 `integrations.json` 可见项与 AST 生成结果做 name、description、category、
  bgColor differential comparison，全部一致；
- `@sim/tool-catalog/browser` 提供 `get`、`all`、`search`，支持 alias、provider、
  cursor 和 limit；浏览器入口只消费 15,127 bytes gzip 的 summary；
- `integration-matcher.ts` 和 Copilot `use-mention-data.ts` 已改为读取
  `apps/sim/lib/catalog/client.ts`，不再直接或动态 import Block Registry；
- 独立 catalog client browser build 为 80,140 bytes raw / 14,425 bytes gzip，Executor、
  Runtime Registry、execution、Node builtin、Zod、Feishu SDK 和 Provider SDK marker 均为 0；
- consumer boundary gate 固定检查上述两个真实画布消费者，Catalog tests 2/2、画布
  integration matcher tests 2/2 通过；
- 全局浏览器闭包分类计数暂未下降，因为同一页面仍有其他旧链路触达运行时；局部消费者
  seam 已由专门 gate 证明，剩余闭包继续由 Ticket 06 及后续 UI/API 迁移清除。

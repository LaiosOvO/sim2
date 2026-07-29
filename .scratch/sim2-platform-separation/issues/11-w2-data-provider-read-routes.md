# 迁移 W2 数据与 Provider 只读接口

What to build: 迁移 W2 中 providers/logs/mcp/table/settings/knowledge 的 36 条只读接口。
Blocked by: 09
Status: ready-for-agent

## What to build

使用 inventory 的 `Wave = W2` 与上述顶级领域作为唯一筛选条件，读取侧只返回 contract DTO。

## Acceptance criteria

- 筛选结果精确为 36 条并生成 coverage report。
- metadata 查询不导入完整 Runtime Registry；需要工具信息时只使用 Tool Catalog。
- DB/cache/provider failure、分页、空结果、权限与新旧响应差异测试通过。
- 浏览器消费者改用 contract client，未新增 server-only 闭包。

## Blocked by

09。

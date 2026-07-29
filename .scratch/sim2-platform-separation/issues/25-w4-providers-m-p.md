# 迁移 W4 Provider M–P

What to build: 迁移 provider slug 首字母 M–P 的 74 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

生成 adapter 与兼容 façade，处理 Microsoft、数据库、消息与 Polaris tool 的特殊映射。

## Acceptance criteria

- selector 精确为 74 条。
- Microsoft 等 OAuth token/文件工具通过安全、刷新与 differential test。
- 数据库工具覆盖注入、超时、连接回收和结果大小限制。
- Polaris tool 与 Biz API 不互相反向依赖。

## Blocked by

20。

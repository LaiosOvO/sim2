# 迁移 W8.1 Identity 与 Access

What to build: 迁移 W8 Identity/Access 子波次的 16 条 Polaris 路由与 domain model。
Blocked by: 16, 34
Status: ready-for-agent

## What to build

建立 Person、Org、Role、DataScope、membership 与审计的 Biz port/application service，复用平台 auth context。

## Acceptance criteria

- 按对齐文档的 W8.1 selector 精确为 16 条。
- Polaris fixture 的身份、角色、数据范围和租户隔离行为兼容。
- Identity Biz 不导入 Feishu/Meegle/DB 具体 adapter，只依赖 port。
- C/A/D/I/E/S 测试与 coverage report 通过。

## Blocked by

16、34。

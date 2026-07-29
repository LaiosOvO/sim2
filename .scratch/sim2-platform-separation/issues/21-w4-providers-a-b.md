# 迁移 W4 Provider A–B

What to build: 迁移 provider slug 首字母 A–B 的 77 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

以 `Wave = W4` 且 `/api/tools/<provider>` 的 provider 首字母落在 A–B 为唯一 selector，运行生成器并修复 provider 特有 adapter。

## Acceptance criteria

- selector 精确为 77 条，生成 manifest 与 inventory 对齐。
- 每个 provider 的 auth、参数、分页/流、错误映射与旧实现 differential test 通过。
- API/Web 构建不静态加载本批 Provider SDK；Worker lazy-load 测试通过。
- 清单指定 C/A/D/I/S/R 测试有完整证据。

## Blocked by

20。

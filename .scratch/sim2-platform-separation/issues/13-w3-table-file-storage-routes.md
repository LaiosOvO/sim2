# 迁移 W3 Table、File 与存储接口

What to build: 迁移 W3 中 table 19 条与 files 11 条，共 30 条。
Blocked by: 10, 11, 12
Status: ready-for-agent

## What to build

抽出对象存储 port、流式 body/response helper、Range/Content-Type/size 限制和上传审计。

## Acceptance criteria

- inventory selector 精确命中 30 条，coverage report 无重叠。
- JSON、multipart、binary、stream、signed URL 行为与旧实现 differential test 通过。
- B/S 测试覆盖 Range、MIME、大小、回压、SSRF、路径/文件名与 token。
- Web 客户端不导入 storage SDK 或 server encryption。

## Blocked by

10、11、12。

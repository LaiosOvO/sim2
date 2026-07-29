# 迁移 W4 Provider E–H

What to build: 迁移 provider slug 首字母 E–H 的 47 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

生成并接入 adapter，重点验证邮件、协作与云 API 的 credential/分页/附件差异。

## Acceptance criteria

- selector 精确为 47 条。
- wire contract、认证、Provider integration 和 differential tests 通过。
- 文件/附件工具补充 B/S 测试，secret 不进入日志或事件。
- browser/server import closure 门禁通过。

## Blocked by

20。

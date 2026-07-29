# 迁移 W7 Public Callback、Token 与 Webhook

What to build: 迁移 W7 除 Tickets 32–33 外的 21 条公网边缘接口。
Blocked by: 32, 33
Status: ready-for-agent

## What to build

补集覆盖 approvals/files/hr/Feishu/MCP/Polaris callback 与 webhooks，统一签名、重放保护和快速 ACK→job。

## Acceptance criteria

- 补集精确为 21 条；W7 三个 report 合并后恰为 61 条。
- 签名、timestamp/nonce、重放、SSRF、token/OTP、payload limit、幂等和乱序测试通过。
- callback 快速返回，副作用由 Worker 执行并可追踪。
- C/A/D/I/R/S/E 与适用 B/P 测试全部通过。

## Blocked by

32、33。

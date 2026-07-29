# 建立 Feishu 与 Meegle Infra Adapters

What to build: 将 Polaris 的 Feishu/Meegle SDK、鉴权、webhook、同步原语封装成 Infra extension。
Blocked by: 06, 35
Status: ready-for-agent

## What to build

Feishu 作为单一 infra extension；Meegle 作为独立 connector。Biz 只看到 ports/DTO，composition root 绑定实现。

## Acceptance criteria

- Biz source tree 对具体 Feishu/Meegle SDK 的直接 import 数为 0。
- token refresh、签名、分页、rate-limit、retry、idempotency 与错误映射有 adapter contract tests。
- Meegle 原始 schema 不泄露到 PM domain；映射位于 PM anti-corruption layer。
- Feishu channel/approval/directory 共享底层 client，但暴露分离能力 port。
- secrets 只在后端注入且日志脱敏。

## Blocked by

06、35。

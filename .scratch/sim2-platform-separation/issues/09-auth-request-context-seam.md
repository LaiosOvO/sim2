# 抽离认证、授权与请求上下文 seam

What to build: 为后续所有迁移接口提供独立 API 可复用的 session/API-key/tenant/authz 验证层。
Blocked by: 04, 07
Status: ready-for-agent

## What to build

保留现有 Better Auth 数据与 secret 兼容，抽出身份验证、workspace/workflow 权限与审计上下文，避免 auth 导入 workflow lifecycle/executor/registry。

## Acceptance criteria

- auth verifier 的依赖闭包不含 webhooks、MCP、Executor、Runtime Registry 与 UI。
- session、API key、public token、internal/hybrid 四类 request context 有契约和拒绝默认值。
- 认证先于 body validation；跨 workspace/组织访问、撤销、过期与缺失凭证有测试。
- Next 兼容门面与独立 API 对同一凭证返回一致身份/错误。

## Blocked by

04、07。

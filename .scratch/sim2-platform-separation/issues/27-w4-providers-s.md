# 迁移 W4 Provider S

What to build: 迁移 provider slug 首字母 S 的 91 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

覆盖云、协作、数据与消息 S 类 provider，统一签名、重试、分页和流式处理。

## Acceptance criteria

- selector 精确为 91 条。
- S3/SSH/SFTP 等高风险能力通过路径、网络、secret、超时和审计测试。
- 所有 provider 保持历史 ID/输入输出兼容并有 differential fixture。
- import graph、lazy loading、provider 级回滚测试通过。

## Blocked by

20。

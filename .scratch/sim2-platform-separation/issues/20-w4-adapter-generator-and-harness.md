# 建立 W4 Tool Adapter 生成器与兼容测试框架

What to build: 用生成式 expand-contract 流程迁移 555 个工具接口，避免手工复制。
Blocked by: 06, 09, 19
Status: ready-for-agent

## What to build

从 inventory/catalog/runtime descriptor 生成 contract binding、API handler、Next facade、测试矩阵和 coverage manifest；业务执行仍委托 Worker Runtime Registry。

## Acceptance criteria

- 生成过程确定、幂等、clean tree；禁止覆盖手写 extension code。
- 每个 provider 可独立生成/测试/启用/回滚，历史 path/method/tool ID 保持兼容。
- harness 自动执行 contract/auth/differential/provider failure/idempotency/security 测试。
- 生成物不让 API/Web 静态导入全部 provider；Worker 按 provider/tool 懒加载。
- W4 coverage checker 要求 555 条且每条只属于一个字母批次。

## Blocked by

06、09、19。

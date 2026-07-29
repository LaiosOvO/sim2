# 迁移 W4 Provider Q–R

What to build: 迁移 provider slug 首字母 Q–R 的 10 条 W4 工具接口。
Blocked by: 20
Status: ready-for-agent

## What to build

运行生成器并完成较小 provider 集的 adapter、catalog 与兼容测试。

## Acceptance criteria

- selector 精确为 10 条。
- contract/auth/differential/provider integration/security/retry 测试通过。
- 未调用 provider 不进入 Worker startup closure。
- route flag 可逐 provider 启用与回滚。

## Blocked by

20。

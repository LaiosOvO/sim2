# 建立导入边界、闭包预算与性能基线门禁

What to build: 将浏览器/服务端/Worker/Biz/Infra 的依赖规则变成 CI 可执行门禁。
Blocked by: 02
Status: ready-for-agent

## What to build

扩展现有 monorepo boundary 检查，加入客户端闭包扫描、循环依赖、bundle allow/deny list 与编译性能采集。

## Acceptance criteria

- CI 阻止 Web client 导入 Executor、Runtime Registry、Sandbox、server crypto、密钥或 Provider SDK。
- CI 阻止 Biz 直接导入具体 Infra；只有 composition root 可绑定 adapter。
- 生成 route compile、模块数、RSS、bundle/chunk 体积基线报告并保存机器可读结果。
- 代表性页面与 API 的预算可配置、失败信息能定位最短污染链。
- 现有 Next 默认 Turbopack 构建继续通过；`dev:webpack` 只作为诊断，不宣称已迁移 Vite。

## Blocked by

02。

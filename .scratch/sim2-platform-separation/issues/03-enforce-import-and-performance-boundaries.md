# 建立导入边界、闭包预算与性能基线门禁

What to build: 将浏览器/服务端/Worker/Biz/Infra 的依赖规则变成 CI 可执行门禁。
Blocked by: 02
Status: in-progress

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

## Implementation evidence

- 已建立 browser runtime closure 扫描与 CI ratchet，能输出每类服务端污染的最短链；
- 已建立 Biz/Infra/App/Package 直接与动态导入边界；
- 已保存 Polaris trace、RSS、Client root、开发 chunk 与目标预算的机器可读基线；
- 已建立可对任意 `.next` 目录重跑的采集器，生产构建在 CI 中上传 metrics artifact；
- 已保存 bundle deny list 与重型依赖 allow scope。

尚未完成：历史 Client root 污染必须在 Catalog、Replay/Debug、Auth seam 迁移后归零；届时将
bundle deny list 从 ratchet 切换为严格扫描，并补齐循环依赖门禁。此 ticket 在严格门禁启用
前不得标记完成。

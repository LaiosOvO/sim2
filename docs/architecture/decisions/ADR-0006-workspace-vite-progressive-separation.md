# ADR-0006：Workspace Vite 渐进式前后端分离

- 状态：Accepted
- 日期：2026-07-31
- 范围：Workspace Home、Workflow Editor、Node API、Realtime、Worker

## Context

完整 Next/Turbopack 模式在受控 Node 22 环境中无法让 Workspace Home 在 60 秒内稳定可用，
并超过 4 GiB RSS 停止条件。独立 `apps/workspace-web` 已证明最小 React 入口和聚合
`/api/workspace-bootstrap` 可以把核心 Home 降到秒级。后续增量已把附件上传、浏览器语音
转写、分类 Tool Call 卡片、审批，以及桌面桥上的 Browser/Terminal 执行、接管、handoff
和可视资源面板迁入 Vite。Workflow Editor 已有画布、安全属性编辑、无环连线、313/313
Block/Trigger 创建模板、Basic/Advanced 通用配置、上传、Loop/Parallel 容器、草稿全流程与选中节点 SSE 运行/恢复、
部署/下线、部署版本恢复、执行日志详情、Realtime presence、光标和节点选择。后续迁移还加入
Credential 与核心资源选择、Table/Tool/Skill/MCP 深层 Builder、结构化 HITL 表单、冲突感知逐操作同步、
本地 undo/redo 和远端逆操作应用。Provider 专属资源 selector 已通过认证、workspace 隔离的窄网关迁入，
Provider SDK、环境变量解密和凭据仍只在服务端按交互懒加载。Home Tool Call 继续采用原 Next 的
统一生命周期行；集成品牌和操作名称来自浏览器安全 Catalog，Browser/Terminal 使用专用交互。
撤销语义经审计确认是每用户本地栈，而不是全局共享栈；远端逆操作正常传播，失效历史按图状态剪除。

一次性重写完整 Home 和 Editor 会同时改变前端框架、认证、实时协议、工具渲染和历史工作流
兼容边界，无法逐项归因，也缺少安全回退路径。

## Decision

1. 最终目标采用“Vite 前端 + Node API + Realtime + Worker”的前后端分离结构。
2. 迁移按 Home 核心、Home 高级能力、Editor Shell、Editor 高级能力的顺序渐进执行。
3. 默认 `/workspace/:workspaceId/home` 使用 Vite；迁移期间
   `?runtime=next` 显式进入 Next 完整 Home，保证尚未迁移的能力仍然可达。
4. Vite 首屏只允许依赖 React、纯浏览器 helper 和窄接口；不得导入 `apps/sim`、Next、
   `@sim/*` 服务端包、Runtime Registry、Executor、Sandbox、Provider SDK、DB 或 Auth 实现。
5. 通用 Tool Call 生命周期可以在 Vite 中使用结构化 SSE 字段轻量渲染；工具类别、状态卡
   和审批动作独立懒加载。需要 Provider 凭据上下文的专属深度交互继续由 Next 完整 Home 提供。
6. Browser/Terminal、语音、上传和其他非首屏能力必须按实际操作动态加载，不得重新进入
   Home 静态依赖闭包。
7. Vite 可承载 Workflow Editor 的 Shell、画布、Catalog 和不依赖 Runtime Registry 的
   安全编辑操作。Block creation template 只能由构建期 AST 生成器或受测试约束的显式 recipe
   产生；环境默认值只能序列化为浏览器运行时 sentinel。313 个模板按 16 个稳定分片动态加载，
   单分片 gzip 上限为 40 KiB。资源选择、深层 Builder 和结构化 HITL 必须继续按需加载；
   Provider 专属资源 selector 必须通过白名单契约和服务端懒注册表访问，不得把 Provider SDK、
   DB/Auth、凭据或环境变量解密带入 Vite；协作撤销必须保持每用户本地历史、逆操作走正常 Realtime
   队列、远端操作重放并剪除失效步骤，不得引入会改变产品语义的全局撤销栈。不得使用 Home 指标
   宣称 Editor SLA 通过。
8. 生产环境不直接暴露 Vite 开发端口。网关在同域下提供前端静态资源，并分别转发
   `/api/*` 和实时连接；迁移期兼容地址由 `SIM_NEXT_BASE_URL` 注入，不在客户端写死
   开发端口。`WORKSPACE_NEXT_FALLBACK=1` 默认保留 Next 兼容路由，仅在最终等价与真实
   SLA 门禁通过后才允许设为 `0`。

## Consequences

- 迁移期间同时存在 Vite 和 Next 两个前端实现，但生产环境只暴露统一网关入口。
- Vite 的高级面板、附件、语音、桌面执行和 Tool Call 视图必须保持独立异步 chunk；CI
  门禁阻止其退回静态入口。
- 性能报告分开记录隔离缓存的编译冷可用、编译后的页面冷可用和热刷新，避免用预热隐藏
  首次编译成本。
- Next 只有在 Home、Editor、历史工作流和稳定 Tool/Block/Trigger ID 全部通过等价验收后
  才能退出 Workspace 路由。

## Rejected alternatives

- 一次性重写完整 Workspace：回归面过大，无法逐阶段验收。
- 只继续调整 Next 配置：已经触发冷启动和 RSS 停止条件。
- 将原 Home 组件直接复制进 Vite：会把重型注册表和服务端依赖重新带回浏览器入口。
- 用 `dev:minimal` 作为产品方案：会精简 Integration 能力，不满足功能等价要求。

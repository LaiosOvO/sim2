# Node 22 开发性能问题清单与根因报告

## 结论

约两分钟的页面启动、接口等待和刷新卡顿不能归结为“Next.js 天生慢”。已有 donor trace
显示，Next 16/Turbopack 在同一进程内放大了过大的浏览器依赖闭包：Workspace 页面为了展示
Block/Tool metadata，间接触达 Runtime Registry、Executor、Sandbox、Provider SDK、DB/Auth
和服务端加密，导致按路由编译时遍历数千模块并触发高 RSS 与重启。Next 是放大器，混合
client/server import graph 才是首要工程根因。

独立 API 的网络、鉴权和数据库耗时是另一条链。只有在路由已编译后仍能复现接口 P95
超过 1 秒，才把问题归入查询或代理；不能把首次请求包含的编译时间当成数据库时间。

## 证据边界

- `docs/testing/performance-baseline.json` 是 Polaris donor 的历史开发 trace，不代表本分支
  优化后的成绩。它记录 Workspace Home 约 272 秒、编辑器约 84 秒、峰值 RSS 约 19 GB 和
  19 次内存阈值重启。
- `docs/testing/evidence/frontend-experience-round-1.json` 证明第一轮已减少污染根数量，但
  没有受控浏览器旅程，因此不能据此声称页面达到秒级。
- 本专项新增三模式、三轮隔离缓存的浏览器采集器，并已在 Node 22.20.0、WSL2 ext4、
  固定 PostgreSQL/Redis/账号/workspace/workflow 上启动受控采集。首个 full 冷轮次在 Home
  可用前即超过 9 GiB RSS并使 runner 退出，minimal 同样超过 8 GiB；机器可读证据因此
  明确标记为 `failed-controlled-node22-capture`，而不是继续标记“待采集”。

## 问题清单

| ID | 问题 | 分类 | 是否为 Next 根因 | 本专项处理 |
| --- | --- | --- | --- | --- |
| PERF-01 | Next 脚本依赖 `next` shebang，实际运行时不透明 | 启动链 | 否 | 显式由 `process.execPath` 加载 Next CLI |
| PERF-02 | Realtime 开发与生产直接用 Bun 执行源码 | 启动链 | 否 | 改为 Node 22 + `tsx`，构建为 Node 产物 |
| PERF-03 | API/Worker 虽用 Node，但缺少统一的低版本快速失败与运行时证据 | 启动链 | 否 | 四服务统一 Node 22.19+ guard 与日志 |
| PERF-04 | Workspace 权限判断为读取 `hideFromToolbar` 导入完整 Block Registry | client/server 污染 | 否，Next 放大 | 改为读取 `@sim/tool-catalog` 浏览器摘要 |
| PERF-05 | 纯 tile 颜色 helper 与 registry-backed bare icon helper 同文件 | client/server 污染 | 否，Next 放大 | 拆出纯浏览器叶子模块并迁移消费者 |
| PERF-06 | Home integration chip 为一个图标同步导入完整 Block Registry | 首屏依赖闭包 | 否，Next 放大 | 由 Catalog 解析图标名，并按实际渲染动态加载 icon 模块 |
| PERF-07 | 完整、minimal、webpack 的历史样本未在同一提交/机器/缓存条件下采集 | 证据 | 否 | 新增统一受控旅程和机器可读报告 |
| PERF-08 | 首次接口样本混合编译、服务端、数据库与客户端渲染 | 观测 | 部分 | 报告拆分页面可用时间、API waterfall、稳态直采和 Next trace |
| PERF-09 | 热刷新和内存没有硬门槛 | 回归 | 否 | 受控沙箱按 P95、最大值和 RSS 硬验收 |
| PERF-10 | `dev:full` 只启动 Web 与 Realtime，不能证明完整四服务拓扑 | 工程入口 | 否 | 完整模式同时启动 Next、Realtime、API、Worker |
| PERF-11 | Realtime 与独立 API 的开发默认端口均为 3002 | 服务拓扑 | 否 | 保留 Realtime 3002，API/Worker 开发默认改为 3012/3013，Next 代理同步 |
| PERF-12 | Realtime Docker 直接用 Bun 执行 TypeScript bootstrap | 部署运行时 | 否 | Bun builder 产出 Node bundle，Node 22 runner 执行 bootstrap 产物 |
| PERF-13 | Home 首屏在模块加载时构建完整模板建议池并同步加载 OAuth 弹窗 | 首屏依赖闭包 | 否，Next 放大 | 首屏改用轻量静态建议，个性化目录与弹窗在数据就绪或用户操作时按需加载 |
| PERF-14 | 全局 Tailwind 开发扫描阻塞根布局冷编译 | 构建链 | 否，Next 放大 | 开发模式消费预生成 CSS，并增加 `css:build`/`css:check` 门禁 |
| PERF-15 | Home、Workspace Chrome、搜索与导入流程同步触达非首屏模块 | 首屏依赖闭包 | 否，Next 放大 | 非首屏面板和搜索索引按访问加载，叶子 contract 替代 barrel import |
| PERF-16 | Auth 普通会话路径静态加载邮件、生命周期、PostHog、凭据草稿和 workflow 禁用逻辑 | 服务端依赖闭包 | 否，Next 放大 | 相关依赖仅在注册、封禁或连接回调执行时加载 |
| PERF-17 | 采集失败时异常中止，不能落盘失败轮次 | 证据 | 否 | 采集器记录失败状态、原因和可用 trace，避免再次留下“待采集”占位 |

## 已切断的依赖链

```text
usePermissionConfig
  -> permission-groups/block-access
  -X-> blocks/registry
  -> lib/catalog/client
  -> @sim/tool-catalog/browser
```

```text
workspace home integration chip
  -X-> blocks/registry -> registry maps -> block/tool implementations
  -> generated catalog summary
  -> lazy browser icon module
```

```text
tile color consumer
  -X-> blocks/icon-color -> blocks/registry
  -> blocks/tile-icon-color
```

```text
workspace home initial render
  -X-> getAllBlockMeta + integrations + OAuth modal
  -> static initial suggestions
  -> lazy personalized catalog / lazy OAuth modal
```

上述修改不删除 Integration，不改变 Tool/Block/Trigger ID，也不改变历史工作流格式。Runtime
Registry 仍由执行侧按稳定 ID 使用。

## 受控采集结果

固定旅程已建立并幂等复用：

- workspace：`927833e4-f4ca-4442-beee-1762a017cfcd`；
- workflow：`0528067f-2766-48fd-b3f3-969ad42d05f2`；
- 数据库：本地 PostgreSQL `simstudio_perf`；
- 运行时：Next、Realtime、API、Worker 均由 Node 22.20.0 执行；
- 源码位于 WSL2 ext4，排除了 Windows NTFS 文件监听作为唯一原因。

首轮冷启动的结果是明确失败，而非缺少数据：

| 模式 | 一分钟时 Next RSS | V8 heap used | Home 状态 |
| --- | ---: | ---: | --- |
| full Turbopack | 9,134 MiB | 113 MiB | 未可用，runner 随后退出 |
| minimal registry | 8,277 MiB | 244 MiB | 未可用，最后编译到 `/api/folders` 后退出 |

full 与 minimal 的差值说明完整注册表仍有成本，但两者都远超 4 GiB，故注册表不是剩余问题
的主要解释。prepare 阶段中 `/api/auth/get-session`、`/api/auth/sign-in/email` 与
`/workspace` 的 application-code 分别约为 83 ms、437 ms、103 ms，而总请求耗时为
24.8 s、24.3 s、32.8 s，耗时主要来自 Next 编译，不支持“数据库查询导致两分钟”等结论。

## 如何判定下一步

1. 完整模式相对 minimal 的主要差值仍来自 compile trace 或 RSS：继续按最短污染链把
   metadata、contract 和浏览器 helper 收窄，不能用 minimal 作为日常功能方案。
2. 路由编译完成后关键 API P95 超过 1 秒：对最慢路径做直连采样；涉及数据库时提交
   `EXPLAIN (ANALYZE, BUFFERS)`、索引/查询前后对比和回归测试。
3. 依赖闭包达标后 Next 自身冷编译仍超过 10 秒：单独提交框架迁移评估。Vite/其他框架
   迁移不与本专项混做。

## 风险与剩余项

- 编辑器为了渲染已放置 Block 的完整 schema 仍需要配置数据；后续应设计按 Block ID
  加载的浏览器配置投影，而不是直接删除 registry 能力。
- 工具调用历史行仍有 Runtime Registry 图标查找链，需在 Catalog 增加稳定的 tool ID 到
  presentation metadata 映射后再迁移，不能用不可靠的字符串前缀猜测。
- 固定旅程和 runner 已具备，但首轮即明确失败；在 Home/Editor 完成三轮并满足全部门槛前，
  不宣称 SLA 已通过。
- full/minimal 在清理已知静态污染链后仍超过 60 秒和 8 GiB，已满足“Next 自身仍超过
  10 秒则形成独立迁移建议”的触发条件。下一阶段应评估将交互式 Workspace/Editor
  开发入口迁往 Vite，或把重型交互面拆为独立前端构建；本专项不在同一 PR 内实施框架重写。

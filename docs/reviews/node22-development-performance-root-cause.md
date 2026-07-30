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
- 本专项新增三模式、三轮隔离缓存的浏览器采集器。当前提交中的
  `docs/testing/evidence/node22-development-performance.json` 只记录待采集状态；完成
  Node 22 沙箱验收后必须用同一脚本覆盖该文件。

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
- 未提供固定账号、workspace、workflow、数据库和受控 Node 22 runner 前，不宣称 SLA
  已通过。

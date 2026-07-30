# Node 22 开发性能重构与运行手册

## 已完成

- Next、Realtime、API、Worker 统一为 Node.js `>=22.19.0` 应用运行时。
- Realtime 容器由 Bun builder 生成 `dist/bootstrap.js`，Node 22 runner 执行产物；runtime
  secret hydration 与 DB role 初始化仍由原 `bootstrap.ts` 保留。
- `dev:full`、minimal 诊断和 webpack 诊断都启动四个服务。
- 新增 `check:node-runtime-entrypoints`，CI 验证版本、入口和四服务拓扑。
- 开发端口固定为 Next 3000、Realtime 3002、API 3012、Worker 3013，避免 Realtime/API
  同占 3002；所有端口仍可由环境变量覆盖。
- 新增 `perf:dev:prepare` 与 `perf:dev:check`。
- 浏览器会话和原始日志保存在被忽略的 `.perf/`。
- 权限 metadata、Workspace Home integration icon 和 tile color helper 已切断确定性的
  Runtime Registry 展示链。
- Workspace Home 的首屏建议不再同步构建完整模板候选池或加载 OAuth 弹窗；个性化建议
  和连接流程保持完整，但退到数据就绪或用户操作后的异步 chunk。

## 前置条件

- Node.js `22.19.0` 或更高的 Node 22 版本；
- Bun `1.3.13`；
- 可用的 PostgreSQL、Auth secret 和项目要求的其他本地环境变量；
- 固定测试账号、workspace 与 workflow；
- Playwright Chromium：首次执行可运行 `bunx playwright install chromium`。

账号密码只放在进程环境变量中：

```powershell
$env:PERF_EMAIL = 'perf-user@example.test'
$env:PERF_PASSWORD = '<local-only>'
$env:PERF_WORKSPACE_ID = '<fixed-workspace-id>'
$env:PERF_WORKFLOW_ID = '<fixed-workflow-id>'
```

可选变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PERF_BASE_URL` | `http://127.0.0.1:3000` | Next 地址 |
| `PERF_MODES` | `full,minimal,webpack` | 对照模式 |
| `PERF_ROUNDS` | `3` | 每种模式独立冷启动轮数 |
| `PERF_WARM_RELOADS` | `10` | 每个路由每轮热刷新次数 |
| `PERF_API_SAMPLES` | `30` | 每个关键接口稳态采样数 |
| `PERF_API_PATHS` | 自动选最慢 5 个 GET API + health | 逗号分隔的固定关键接口 |
| `PERF_HOME_READY_SELECTOR` | Home 输入控件 | 首次可用标志 |
| `PERF_EDITOR_READY_SELECTOR` | React Flow viewport | 编辑器首次可用标志 |
| `PERF_EVIDENCE_PATH` | `.perf/reports/...json` | 报告输出位置 |

## 采集步骤

先启动完整开发拓扑并准备一次登录态：

```powershell
bun run dev:full
bun run perf:dev:prepare
```

停止手工服务后运行受控检查。检查器会为每轮创建独立 Next dist directory，启动/停止四服务：

```powershell
bun run perf:dev:check
```

准备提交证据时显式写入文档目录：

```powershell
$env:PERF_EVIDENCE_PATH = 'docs/testing/evidence/node22-development-performance.json'
bun run perf:dev:check
```

报告会记录：

- 开始和结束 `sourceSha`，源码漂移时失败；
- Node、Bun、Next 版本与 CPU/内存；
- 环境变量非敏感摘要与缓存目录；
- 四服务 runtime proof；
- health 就绪时间；
- Home/Editor 冷可用时间和热刷新原始样本；
- 页面 API waterfall、状态码及关键接口 30 次样本；
- Next compile trace、峰值 RSS 和内存阈值重启；
- 每条 SLA 的通过状态。

## 验收门槛

完整 Turbopack 模式必须同时满足：

- 服务就绪中位数 `<=30s`；
- Home 与 Editor 首次可用中位数 `<=10s`，单轮 `<=15s`；
- 两个页面热刷新 P95 `<=2s`；
- 每个关键接口稳态 P95 `<=1s` 且无 4xx/5xx；
- Next 峰值 RSS `<=4GiB`；
- 三轮均发现 Next、Realtime、API、Worker 的 Node runtime proof。

minimal 与 webpack 只进入对照报告，不参与最终通过判定。

## 确定性门禁

```powershell
bun run check:node-runtime-entrypoints
bun run check:browser-runtime-closure
bun run check:lightweight-client-surfaces
bun run check:catalog-browser-build
bun run check:catalog-consumers
bun run check:contract-browser-build
bun run check:runtime-catalog
bun run check:runtime-registry-boundary
bun run check:runtime-registry-lazy-build
bun run check:worker-role-isolation
bun run check:realtime-prune
bunx vitest run scripts/architecture/performance/performance-metrics.test.ts
```

应用回归至少覆盖登录、Workspace Home、编辑器、工具搜索和代表性工作流执行，且必须使用
完整注册表。

## 故障定位

- full 明显慢于 minimal：查看两者 `nextTrace.trace.longestCompilePaths`、RSS 和 browser
  closure 最短链，继续切 metadata/import boundary。
- full 与 minimal 接近但 webpack 更快：保留 Next，提交可复现的 Turbopack issue 或局部
  规避；webpack 仍只是诊断入口。
- 编译结束后 API 仍慢：用报告中的稳态路径直连 API。数据库改动前必须先提交 `EXPLAIN`。
- 所有依赖边界清理后 Next 冷编译仍超过 10 秒：另立框架迁移 ADR，不在本专项重写前端。

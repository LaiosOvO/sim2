# Sim2 Node 22 与 Next.js 开发性能专项完整改造说明

## 1. 文档目的

本文档集中说明 `LaiosOvO/sim2` Node 22 与开发性能专项做了什么、为什么这样改、具体如何
实现、如何启动和验证，以及当前性能结果与后续重构边界。

本文档对应以下代码快照：

| 项目 | 值 |
| --- | --- |
| 基线分支 | `codex/frontend-backend-refactor` |
| 基线提交 | `acd7c56335a90f89edf7c8e8ec57d05f980a2aed` |
| 专项分支 | `agent/node22-next-performance` |
| 专项起点提交 | `bbaf79bc7d0030539fa2fe0112f40060699c07a7` |
| 草稿 PR | `LaiosOvO/sim2#1` |
| 改动规模 | 73 个文件，约 2354 行新增、410 行删除 |

## 2. 改造背景

项目原有开发环境存在以下现象：

- Next.js 前端启动、首次打开 Workspace 和刷新页面可能耗时约两分钟；
- 首次页面请求混合了 Next 路由编译、服务端处理、数据库查询和浏览器渲染，无法直接判断
  慢在哪里；
- Next、Realtime、API、Worker 的实际运行时不完全一致；
- 浏览器只需要工具名称、图标和可见性等展示数据，却可能间接导入完整 Block/Tool Runtime
  Registry；
- Runtime Registry 又连接 Executor、Sandbox、Provider SDK、数据库、鉴权和服务端加密逻辑，
  导致 Next 开发编译需要处理远超首屏需要的依赖图；
- 缺少固定账号、workspace、workflow、缓存状态和机器条件下的可重复性能证据。

本专项的目标不是删除功能或用 `dev:minimal` 代替完整开发模式，而是在保持所有 Integration、
Tool、Block、Trigger 和历史工作流兼容的前提下：

1. 统一应用进程到 Node.js 22；
2. 建立可信的性能采集基线；
3. 清理浏览器首屏到服务端执行实现的依赖污染链；
4. 判断约两分钟延迟究竟是否由 Next.js 引起；
5. 为是否继续保留 Next.js 或拆分独立前端构建提供证据。

## 3. 最终架构

```mermaid
flowchart TD
  Bun["Bun 1.3.13<br/>安装、构建、Turbo/Concurrently 调度"]

  subgraph Node22["实际应用进程：Node.js 22.19+"]
    Next["Next.js 16<br/>登录、兼容路由、未迁移写接口<br/>端口 3000"]
    Vite["Workspace Home / Vite 8<br/>端口 5173"]
    Realtime["Realtime<br/>端口 3002"]
    API["独立 API<br/>Workspace Bootstrap<br/>端口 3012"]
    Worker["Worker<br/>端口 3013"]
  end

  Catalog["@sim/tool-catalog<br/>浏览器安全 metadata"]
  Registry["Runtime Registry<br/>Executor / Sandbox / Provider SDK"]

  Bun --> Next
  Bun --> Vite
  Bun --> Realtime
  Bun --> API
  Bun --> Worker
  Vite --> Catalog
  Vite -->|"GET /api/workspace-bootstrap"| API
  Vite -. "登录与未迁移写接口" .-> Next
  API --> Worker
  Worker --> Registry
  Vite -. "首屏禁止依赖" .-> Registry
```

这里需要区分“脚本调度器”和“应用运行时”：

- Bun 仍用于依赖安装、构建、Turbo、Concurrently 和辅助脚本调度；
- Next、Realtime、API、Worker 的实际服务进程全部由 Node.js 22 启动；
- 每个服务启动时输出运行时名称、Node 版本和 `process.execPath`，可以从日志直接证明运行时。

## 4. 主要根因结论

### 4.1 不是单纯的数据库或接口业务逻辑慢

受控准备阶段得到以下数据：

| 请求 | 总耗时 | 应用代码耗时 |
| --- | ---: | ---: |
| `/api/auth/get-session` | 24.8 秒 | 83 毫秒 |
| `/api/auth/sign-in/email` | 24.3 秒 | 437 毫秒 |
| `/workspace` | 32.8 秒 | 103 毫秒 |

应用处理保持在亚秒级，而总请求耗时达到 24～33 秒，差值主要来自 Next 首次路由和依赖编译。
因此，原始约两分钟现象不能直接归因于数据库查询或业务接口执行。

### 4.2 完整 Runtime Registry 会放大问题，但不是唯一根因

受控冷启动一分钟时：

| 模式 | Next RSS | V8 Heap Used | Home 状态 |
| --- | ---: | ---: | --- |
| 完整 Turbopack | 9,134 MiB | 113 MiB | 未达到可用状态 |
| Minimal Registry | 8,277 MiB | 244 MiB | 未达到可用状态 |

完整模式比 Minimal 模式多消耗约 0.85 GiB，说明 Runtime Registry 的确有成本；但两种模式
都超过 8 GiB，并且 Workspace Home 均未在 60 秒内完成。Registry 不是剩余问题的唯一解释。

### 4.3 当前主要瓶颈是 Next.js/Turbopack 原生编译状态

Next RSS 很高而 V8 Heap 较小，说明大部分内存不在普通 JavaScript 对象中，而位于
Next.js/Turbopack 原生编译、模块图和缓存状态。

结论是：

- Next.js 的按路由开发编译机制放大了过大的模块依赖闭包；
- 浏览器与 Runtime Registry 的耦合是需要修复的工程问题；
- 即使清理已确认的静态污染链，Next 16/Turbopack 仍未达到冷启动目标；
- 在原 Next 入口上不能宣称 Workspace Home 和 Workflow Editor 已达到秒级。

### 4.4 Workspace Home 的 60 秒来自多个 Next 冷路由编译叠加

在同一 Node 22.20、同一代码和缓存状态下逐个访问 Home 首屏接口，首次请求结果如下：

| 路由 | 状态 | 首次总耗时 |
| --- | ---: | ---: |
| `/api/auth/get-session` | 200 | 30,258 ms |
| `/api/workflows` | 401 | 13,012 ms |
| `/api/folders` | 401 | 13,042 ms |
| `/api/mothership/chats` | 401 | 7,006 ms |
| `/api/workspaces/:id/files` | 401 | 10,647 ms |

五个路由冷编译累计约 73,965 ms。日志中的应用代码处理仅为个位数到几十毫秒，证明
“完整页面约 60 秒”主要是多个 Next API 路由首次编译的瀑布，不是这五次数据库查询累计
耗时一分钟。

## 5. 具体改造内容

### 5.1 统一 Node.js 22 启动链路

#### 5.1.1 根目录运行时约束

根目录 `package.json` 新增：

```json
{
  "engines": {
    "bun": ">=1.3.13",
    "node": ">=22.19.0"
  }
}
```

新增 `scripts/runtime/assert-node-22.mjs`：

- 比较当前 `process.versions.node` 是否不低于 `22.19.0`；
- 版本过低时立即终止并输出明确错误；
- 版本正确时输出服务名、运行时、版本和实际 `execPath`；
- 避免“命令由 Bun 调度，所以误以为应用也由 Bun 运行”的情况。

#### 5.1.2 Next 显式 Node 入口

新增 `apps/sim/scripts/run-next.mjs`：

1. 通过 `require.resolve('next/dist/bin/next')` 定位真实 Next CLI；
2. 先执行 Node 22 版本检查；
3. 使用当前 `process.execPath` 加载 Next CLI；
4. 将 `dev`、`build`、`start`、`dev:minimal` 和 `dev:webpack` 都切换到该入口。

因此不再依赖 `next` 可执行文件 shebang 被哪个运行时解释。

#### 5.1.3 Realtime 改为 Node 开发与生产运行

Realtime 原来直接由 Bun 执行 TypeScript，现改为：

- 开发：`node --import assert-node-22.mjs --import tsx --watch src/index.ts`；
- 构建：Bun 将 `src/bootstrap.ts` 构建成 Node 目标的 `dist/bootstrap.js`；
- 生产：`node --import assert-node-22.mjs dist/bootstrap.js`；
- `engines.node` 收紧为 `>=22.19.0`；
- 新增 `tsx` 开发依赖。

`docker/realtime.Dockerfile` 改为两阶段运行：

- Builder 阶段仍使用 Bun 构建 Node 产物；
- Runner 阶段使用 `node:22.20.0-alpine`；
- 容器最终执行 `node apps/realtime/dist/bootstrap.js`，不再用 Bun 直接运行源码。

#### 5.1.4 API 与 Worker 增加统一版本检查

API、Worker 和 Worker Sandbox 的 `dev`、`start` 入口统一预加载
`assert-node-22.mjs`。原本就是 Node 进程的服务不改变业务启动逻辑，只增加运行时硬约束和
可审计日志。

#### 5.1.5 四服务端口隔离

原来 Realtime 和独立 API 都可能使用 3002，现调整为：

| 服务 | 默认端口 |
| --- | ---: |
| Next | 3000 |
| Realtime | 3002 |
| API | 3012 |
| Worker | 3013 |

Next 的 W1、W2、W6 API 代理默认地址同步改为 `http://127.0.0.1:3012`。

根目录 `dev:full`、`dev:full:minimal-registry`、`dev:full:webpack` 和 `dev:full:capped`
都同时启动 Next、Realtime、API、Worker，避免只启动 Web 和 Realtime 时得到不完整的性能
结论。

### 5.2 建立受控性能采集体系

新增三个主要命令：

```powershell
bun run perf:dev:seed
bun run perf:dev:prepare
bun run perf:dev:check
```

#### `perf:dev:seed`

- 从 `PERF_EMAIL` 和 `PERF_PASSWORD` 读取本地性能账号；
- 幂等创建或复用固定账号、workspace 和 workflow；
- 只把资源 ID 写入被 Git 忽略的 `.perf/journey/`；
- 密码不会写入磁盘或性能报告。

#### `perf:dev:prepare`

- 检查 `/api/health`；
- 使用 Playwright Chromium 完成真实登录；
- 验证固定 Workspace 可以访问；
- 将浏览器登录态保存到 `.perf/auth/storage-state.json`。

#### `perf:dev:check`

默认比较：

- 完整 Turbopack；
- Minimal Registry；
- webpack 诊断模式。

每种模式计划执行三轮独立冷启动，每轮：

1. 使用独立且空的 Next `distDir`；
2. 启动完整四服务拓扑；
3. 等待 `/api/health`；
4. 验证四个服务都输出 Node runtime proof；
5. 用真实浏览器测量 Home 和 Editor 首次可用；
6. 每个页面执行 10 次热刷新；
7. 记录页面 API waterfall 和状态码；
8. 对关键 API 直连采样 30 次；
9. 收集 Next compile trace、RSS 和内存重启信息；
10. 检查采集前后源码 SHA 是否发生变化。

采集器还增加了失败轮次持久化：

- 页面超时或服务失败时，报告记录 `status=failed` 和具体原因；
- 保留已经取得的日志、运行时证明和 trace；
- 不再因为第一轮失败而只留下“待采集”占位状态；
- 如果操作系统直接终止 runner，机器可读证据明确记录 runner termination。

#### 性能硬门槛

| 指标 | 验收门槛 |
| --- | ---: |
| 服务就绪中位数 | `<= 30 秒` |
| Home 首次可用中位数 | `<= 10 秒` |
| Editor 首次可用中位数 | `<= 10 秒` |
| Home/Editor 单轮最大值 | `<= 15 秒` |
| 10 次热刷新 P95 | `<= 2 秒` |
| 编译完成后关键 API P95 | `<= 1 秒` |
| Next 稳定 RSS | `<= 4 GiB` |
| 内存阈值重启 | `0` |

### 5.3 收窄浏览器首屏依赖闭包

#### 5.3.1 Catalog 与 Runtime Registry 分离

改造后的职责边界：

```text
浏览器展示层
  -> @sim/tool-catalog / Catalog Summary
  -> 名称、描述、图标名、权限、可见性

Worker 执行层
  -> Runtime Registry
  -> 工具实现、Executor、Sandbox、Provider SDK
```

具体修改：

- `lib/permission-groups/block-access.ts` 不再调用 `getBlock()` 读取完整 Block Registry，
  改为读取 Catalog Summary 的 `visibility.hideFromToolbar`；
- 新增 `lib/catalog/catalog-icon.tsx`，根据 Catalog 中的图标名按需加载图标模块；
- Workspace Home 的 integration chip 不再同步导入 `blocks/registry`；
- 不改变 Tool、Block、Trigger ID，也不删除任何 Integration。

#### 5.3.2 拆分纯浏览器颜色 Helper

原来的 `blocks/icon-color.ts` 同时包含：

- 只需要颜色字符串的纯 UI helper；
- 必须读取完整 Registry 的图标 helper。

即使页面只导入颜色函数，也可能把 Registry 带入客户端依赖图。

现在新增 `blocks/tile-icon-color.ts`：

- 只依赖轻量颜色判断；
- 提供 `isLightTileColor` 和 `getTileIconColorClass`；
- 多个编辑器、预览、集成和侧边栏组件改为直接导入该叶子模块；
- Registry-backed helper 继续保留在原模块，仅供确实需要 Registry 的位置使用。

#### 5.3.3 Home Suggested Actions 延迟加载

原来的 Home 首屏会同步完成：

- 遍历完整 Block metadata；
- 构造所有模板候选；
- 解析 OAuth Integration；
- 加载 OAuth Modal；
- 计算个性化加权建议。

现在拆分为：

- `suggested-actions.tsx`：只保留轻量的首屏静态建议和 UI；
- `suggested-actions-types.ts`：只包含浏览器安全类型；
- `suggested-actions-catalog.ts`：包含完整候选池和个性化计算；
- 数据就绪或用户点击 Shuffle 时再动态加载 Catalog 计算逻辑；
- 用户真正选择 Integration 时再加载 OAuth 解析和弹窗；
- OAuth 功能、建议算法和 Integration 集合保持完整。

#### 5.3.4 Home 非首屏能力延迟加载

- Workflow 导入逻辑改为用户执行导入时动态加载；
- `MothershipView` 仅在资源面板真正展开时渲染；
- 避免折叠状态下仍初始化重型资源预览依赖。

#### 5.3.5 Editor 侧边栏和导入逻辑延迟加载

- 搜索 Modal 未打开时不构建 Integration 和 Connected Account 搜索数据；
- 打开搜索框后再动态加载 Integration Search Items；
- Workflow 导入时再加载压缩包解析、导入持久化和 Workflow Diff Store；
- 将部分 barrel import 改为叶子路径，减少无关模块被静态遍历。

#### 5.3.6 Auth 临界路径减重

Auth 模块原来静态导入大量只有特定回调才需要的能力，包括：

- 邮件模板与邮件发送；
- 生命周期邮件；
- PostHog 服务端客户端；
- Billing Usage；
- Instance Organization；
- Credential Draft；
- Workflow 禁用逻辑。

现在：

- 邮件主题使用叶子模块直接导入；
- 邮件渲染、发送、PostHog、Billing、生命周期和凭据处理在对应回调真正触发时动态加载；
- Session 和普通登录请求不再为这些低频能力预编译整个依赖闭包；
- 业务回调行为保持不变。

### 5.4 Tailwind 从开发时全局扫描改为预生成

新增：

```powershell
bun run --cwd apps/sim css:build
bun run check:tailwind-generated
```

实现方式：

- Tailwind CLI 从 `globals.css` 生成压缩后的 `tailwind.generated.css`；
- 根 Layout 直接导入生成后的 CSS；
- PostCSS 开发链不再在每次 Next 路由编译时运行 Tailwind 全局扫描；
- `css:check` 重新生成 CSS 并通过 Git Diff 检查产物是否漂移；
- CI 增加确定性检查。

### 5.5 Next 缓存与诊断模式

`next.config.ts` 新增 `SIM_NEXT_DIST_DIR`：

- 性能采集时为每个模式使用隔离缓存；
- 每轮采集前清理并重新创建受控缓存目录；
- 固定使用 `.next-perf/current-<mode>`，避免历史缓存目录进入 Next 文件监听范围；
- webpack 模式补充 `@` 根路径 Alias，保证与 Turbopack 的路径解析一致。

`dev:minimal` 和 webpack 只用于根因对照：

- `dev:minimal` 不删除产品 Integration，但用精简 Registry Alias 判断 Registry 成本；
- webpack 用于判断问题是否特定于 Turbopack；
- 两者都不是最终日常开发方案，也不参与完整模式 SLA 通过判定。

### 5.6 修复全量 Sim 类型错误

`resume-page-client.tsx` 原有 6 个类型错误来自对未知 JSON 结构的直接属性访问。

修复方式：

- 新增 `asRecord()`，把 `unknown` 安全收窄为 `Record<string, unknown>`；
- 新增 Pause Response 和 Resume Values 的边界解析 helper；
- 对 `operation`、`inputFormat`、`responseStructure` 和 `submission` 分别做运行时类型判断；
- 将 `Record<string, any>` 收紧为 `Record<string, unknown>`；
- 允许日期字段为 `undefined`；
- 不改变 Resume 页面协议和历史数据格式。

修复后完整 `apps/sim` 的 `tsc --noEmit` 与 `tsgo --noEmit` 均通过。

## 6. 关键文件说明

| 文件 | 作用 |
| --- | --- |
| `scripts/runtime/assert-node-22.mjs` | Node 22.19+ 版本检查与运行时证明 |
| `apps/sim/scripts/run-next.mjs` | 用当前 Node 显式启动 Next CLI |
| `apps/realtime/package.json` | Realtime Node + tsx 开发及 Node 目标构建 |
| `docker/realtime.Dockerfile` | Bun Builder + Node 22 Runner |
| `scripts/architecture/runtime/check-node-entrypoints.mjs` | 验证四服务 Node 入口与版本 |
| `scripts/architecture/performance/seed-dev-journey.mjs` | 创建固定性能账号资源 |
| `scripts/architecture/performance/prepare-dev-journey.mjs` | Playwright 登录和会话准备 |
| `scripts/architecture/performance/check-dev-performance.mjs` | 三模式、三轮性能采集器 |
| `scripts/architecture/performance/performance-metrics.mjs` | P50/P95、RSS 和 SLA 判定 |
| `apps/sim/lib/catalog/catalog-icon.tsx` | 浏览器安全的 Catalog 图标解析 |
| `apps/sim/blocks/tile-icon-color.ts` | 不依赖 Registry 的纯 UI helper |
| `suggested-actions-catalog.ts` | 延迟加载的完整建议候选池 |
| `apps/sim/lib/auth/auth.ts` | Auth 低频依赖动态加载 |
| `apps/sim/app/_styles/tailwind.generated.css` | 预生成 Tailwind CSS |
| `docs/testing/evidence/node22-development-performance.json` | 机器可读性能证据 |

## 7. 启动与使用方式

### 7.1 环境要求

- Node.js `22.19.0` 或更高的 Node 22 版本；
- Bun `1.3.13` 或更高兼容版本；
- PostgreSQL、Redis 和项目所需环境变量；
- 性能旅程需要 Playwright Chromium。

检查版本：

```powershell
node --version
bun --version
```

### 7.2 启动完整开发环境

```powershell
bun install --frozen-lockfile
bun run dev:full
```

日志中应出现类似内容：

```text
[runtime] service=next runtime=node version=22.20.0 execPath=...
[runtime] service=realtime runtime=node version=22.20.0 execPath=...
[runtime] service=api runtime=node version=22.20.0 execPath=...
[runtime] service=worker runtime=node version=22.20.0 execPath=...
```

### 7.3 执行受控性能旅程

账号密码只通过环境变量提供：

```powershell
$env:PERF_EMAIL = 'perf-user@example.test'
$env:PERF_PASSWORD = '<local-only>'

bun run perf:dev:seed
bun run perf:dev:prepare
```

停止手工启动的服务后执行：

```powershell
bun run perf:dev:check
```

可用环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PERF_BASE_URL` | `http://127.0.0.1:3000` | Next 地址 |
| `PERF_MODES` | `full,minimal,webpack` | 采集模式 |
| `PERF_ROUNDS` | `3` | 每种模式冷启动轮数 |
| `PERF_WARM_RELOADS` | `10` | 每页面每轮热刷新次数 |
| `PERF_API_SAMPLES` | `30` | 每个关键 API 采样数 |
| `PERF_API_PATHS` | 自动选择 | 指定关键 API |
| `PERF_EVIDENCE_PATH` | `.perf/reports/...json` | 报告路径 |

## 8. 验证方式

主要确定性门禁：

```powershell
bun run check:node-runtime-entrypoints
bun run check:tailwind-generated
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

类型检查：

```powershell
bunx tsc --noEmit -p apps/sim/tsconfig.json
bunx tsgo --noEmit -p apps/sim/tsconfig.json
bun run --cwd apps/realtime type-check
```

在约 16 GiB 内存的 Windows 开发机上，全量 Sim `tsc` 可能先触及 Node 默认约 4 GiB 堆
上限；此时仅为验证进程设置 `$env:NODE_OPTIONS='--max-old-space-size=8192'` 后重跑。该设置
不用于 Vite/Next 性能采样，也不改变 4 GiB 的开发服务 RSS 门槛。

本专项已验证：

- Node 22 四服务入口检查通过；
- 完整 Sim `tsc --noEmit` 与 `tsgo --noEmit` 通过；
- Auth Route 和性能指标 Vitest 通过；
- Browser Runtime Closure 与 Lightweight Client Surface 门禁通过；
- Catalog、Contract、Runtime Registry、Worker Isolation 门禁通过；
- Realtime prune、类型检查和 Node 构建通过；
- Tailwind 生成产物检查通过；
- Biome 与 `git diff --check` 通过。

## 9. 当前性能结果

### Workspace Home 已达到秒级

最终采用“Next 保留兼容面，Workspace Home 使用独立 Vite 构建”的方案。受控真实链路使用
Node 22.20、固定本地账号、`simstudio_perf` 数据库、真实 session cookie、真实 workspace
和真实独立 API，结果如下：

| 指标 | 结果 | 本阶段门槛 |
| --- | ---: | ---: |
| Vite 服务就绪 | 570 ms | 2,000 ms |
| Home 完整数据冷可用 | 678 ms | 1,000 ms |
| 10 次热刷新 P95 | 112 ms | 500 ms |
| Bootstrap API 30 次 P95 | 17 ms | 1,000 ms |
| Bootstrap API 状态 | 30/30 为 200 | 全部 2xx |
| Vite 生产构建 | 258 ms | 通过 |
| 浏览器 JS gzip | 63.28 KiB | 轻量入口 |

这里的“完整数据冷可用”不是只测静态壳层：浏览器加载真实登录态，并等待
`data-workspace-data-state="complete"`，即 session、Workflows、Folders、Chats 和 Files
已经由独立 API 返回并完成 React 渲染。

### 渐进迁移第二批改进

2026-07-31 的增量改进没有把原 Home 重型组件复制到 Vite，而是增加了可回退、可度量的
迁移边界：

- Vite 能解析 canonical SSE 和历史消息中的 Tool Call 生命周期；
- 通用 Tool Call 状态组件只在消息实际包含工具调用时动态加载；
- `awaiting_approval` 工具调用直接提供 `Review` 链接，进入同一聊天的完整 Home 完成授权；
- 高级能力说明面板只在用户点击 `Advanced` 时动态加载；
- `Open complete Home` 使用 `?runtime=next` 进入原 Next Home，保留需要用户接管、审批
  和完整资源面板的富交互；
- Next 重定向只处理缺少 `runtime=next` 的 Home 请求，避免兼容入口产生重定向循环；
- CI 要求两个高级模块保持动态导入，并运行 Vite 专属 Vitest、类型和构建门禁。

Node 22.20、隔离 Vite 缓存的确定性旅程结果：

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| 服务就绪 | 478 ms | 2,000 ms |
| 隔离缓存编译冷可用 | 1,516 ms | 10,000 ms |
| 编译后新上下文冷可用 | 225 ms | 1,000 ms |
| 10 次热刷新 P95 | 100 ms | 500 ms |
| Vite 生产构建 | 642 ms | 通过 |
| 默认入口 JS gzip | 64.73 KiB | 保持轻量 |
| Tool Call 异步 chunk gzip | 0.52 KiB | 不进入默认入口 |
| 高级面板异步 chunk gzip | 0.67 KiB | 不进入默认入口 |

性能脚本报告 schema 升级为 2，显式区分首次模块转换的 `compilerColdUsableMs` 和编译完成后
空浏览器缓存的 `coldUsableMs`，不再把两种冷启动混成一个不稳定指标。

### 渐进迁移第三批：Home 高级能力

本批继续使用窄接口和动态 chunk，没有复制 Next Home 的上传 hook、桌面 Store 或重型工具
渲染树：

- 附件选择后按现有 `/api/files/presigned` 契约直传对象存储，本地开发自动回退
  `/api/files/upload`；支持部分成功、错误回显、发送和历史附件展示；
- 麦克风按点击动态加载 Web Speech，支持连续和临时转写，权限拒绝或浏览器不支持时给出
  明确错误；
- Tool Call 卡片按 Browser、Terminal、Workflow、File、Integration 分类，仍不渲染任意
  参数和工具输出；
- Sim Desktop 桥存在且设备开关开启时，Vite 向聊天请求声明 Browser/Terminal 能力，并对
  非交互客户端工具执行、去重和回传 `/api/copilot/confirm`；
- `browser_request_takeover`、Terminal `handoff` 和 `awaiting_approval` 继续进入完整 Home，
  避免在没有原生资源面板时隐式执行；
- CI 要求附件列表、上传、语音、桌面执行、Tool Call 和高级面板都保持动态导入。

Node 22.20、隔离缓存的第三批验收结果：

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| 服务就绪 | 567 ms | 2,000 ms |
| 隔离缓存编译冷可用 | 1,699 ms | 10,000 ms |
| 编译后新上下文冷可用 | 243 ms | 1,000 ms |
| 10 次热刷新 P95 | 135 ms | 500 ms |
| Vite 生产构建 | 338 ms | 通过 |
| 默认入口 JS gzip | 66.02 KiB | 保持轻量 |
| 语音异步 chunk gzip | 0.40 KiB | 不进入默认入口 |
| 附件列表/上传异步 chunk gzip | 0.52 / 1.06 KiB | 不进入默认入口 |
| Tool Call 异步 chunk gzip | 0.71 KiB | 不进入默认入口 |
| 桌面执行异步 chunk gzip | 1.62 KiB | 不进入默认入口 |
| 高级面板异步 chunk gzip | 0.73 KiB | 不进入默认入口 |

Playwright 真实浏览器旅程确认附件、麦克风和 Advanced 入口可访问，Advanced 正确显示
Native/Hybrid 边界，麦克风权限拒绝能够回显，完整 Home 链接仍携带 `runtime=next`。

### 渐进迁移第四批：Home 交互补齐与 Editor Shell

本批把此前保留在 Next 回退中的通用交互继续拆成窄接口和异步 chunk：

- Browser takeover 和 Terminal handoff 通过 Sim Desktop bridge 执行，并等待用户显式交回；
- Browser/Terminal 资源面板仅在用户打开 Advanced 后再动态加载，支持浏览器导航、刷新、
  面板边界同步、Terminal 标签页、输入和 scrollback；
- `awaiting_approval` Tool Call 可直接执行 Allow/Skip，并复用现有
  `/api/copilot/tool-permission` 契约；
- Vite Editor 读取现有 `/api/workflows/:id`，渲染最小节点/连线画布，并通过
  `/api/workflows/:id/state` 保存位置、名称、启停和连线；
- 节点 Inspector 按选择动态加载，支持名称冲突检查、安全删除、移除连线、创建无环连线，
  并阻止删除仍拥有子节点的容器；
- 节点重命名遵守与 Next 相同的规范化、保留名和重复名规则，并递归更新下游
  `<旧节点.output>` 引用，避免保存后破坏历史表达式；
- 单节点锁会阻止拖动、属性修改、删除和断连；保存请求期间产生的新编辑通过版本戳继续保持
  `Unsaved`，不会被较早的请求响应错误清除；
- 读取和回写保留未知 block/edge 字段，避免位置或属性保存损坏历史 Workflow 高级配置；
- Tool Catalog 从 `@sim/tool-catalog/generated/browser-summary` 动态加载，313 项
  browser-safe metadata 不进入首屏 chunk；
- Catalog 生成器产出 313/313 个可静态证明安全的 Block 创建模板；构建期解析同文件继承、
  Service Account/Provider Credential 共享字段，并用受控 recipe 对齐 Slack/Linear/Grain、
  文档输入 V2、Enrichment、Guardrails、Pi、Video V3 和 11 个独立 Trigger；
- 模板按 16 个稳定分片加载，单次创建只下载 13.28–33.48 KiB gzip，不导入 Block Registry、
  Executor、DB、Auth 或 Provider SDK；环境相关的 Pi/E2B、Schedule 时区和 Webhook token
  以浏览器运行时 sentinel 安全实例化；
- Inspector 支持 Basic/Advanced 双模式、静态和多选选项、条件显隐、数字范围、时间输入、
  动态资源手工 ID、JSON Builder 回退、Input/Response Format 独立 ID，以及基于现有上传
  契约的 file-upload；Start/API/Input 的动态 outputs 会随输入格式和 run metadata 同步；
- Loop/Parallel 作为 Catalog 之外的专用容器迁入 Vite，支持创建、模式/次数/集合/条件/
  batch size 配置、子节点归属、绝对/相对坐标转换，并同步现有 `loops`/`parallels` 保存结构；
- 草稿运行面板按需调用现有 `/api/workflows/:id/execute` SSE 契约，支持完整运行、运行到选中
  节点和从最近执行快照恢复选中节点，并展示最近 100 个执行事件；停止操作调用服务端
  `/cancel` 契约，不再仅中断浏览器流；执行暂停后可在 Vite 面板加载 pause context、提交通用
  JSON 恢复输入，也可按 `inputFormat` 动态渲染 string、number、boolean、array、object、files
  和 options 表单，校验 required/JSON 后以 `{ submission }` 恢复；
  部署面板复用现有 deploy/undeploy API，并在存在未保存修改时禁止发布旧状态；
- 版本与执行面板按需读取部署版本和最近日志，可查看执行详情并显式恢复历史部署版本；
  Realtime 模块按需连接 Socket.IO room，显示在线 presence，并按既有协议同步区块位置、名称、
  启停、父容器、字段值、边、区块增删和 Subflow 配置；字段更新携带 `expectedValue`，服务端
  拒绝覆盖过期值时显示冲突，本地存在未保存修改时也不静默套用远端状态；画布支持最多 50 步
  Undo/Redo，保存会等待已发送操作确认，离线或确认超时后仍以 HTTP 全量保存作为最终兜底；
- Input/Response Format、Messages、Variables、Filter、Sort、Condition、Router、Knowledge Tag、
  Document Tag 和 Eval 已改为按需加载的可视 Builder；其中 Condition/Router/Knowledge/Document
  Tag 继续按历史约定写 JSON 字符串，其他 Builder 写数组，避免 Vite 编辑破坏旧工作流格式；
- Catalog 字段现在携带浏览器安全的 `columns`、`selectorKey`、`serviceId` 和 `dependsOn` 元数据。
  Credential、Workflow、Knowledge Base、Table、Column、MCP Server/Tool 使用现有窄 API 动态选择；Table、Skill、
  子工作流 Input Mapping、MCP JSON Schema Arguments 和 Tool Input 使用独立深层 Builder。Tool Input
  的 284 组 Catalog capability 另存为懒加载制品，也能读取 workspace custom tool 与 MCP tool；
- Credential 和依赖上下文就绪后，138 个模板字段使用 55 个稳定 Provider Selector key 访问新的
  `/api/selectors/query`。该 POST 契约验证登录态和 workspace 权限，仅返回 `{id,label}`，在服务端解析
  环境变量引用并按 Provider 动态导入 selector definition，不把 Provider SDK、凭据、DB/Auth 或解密逻辑
  带入浏览器。Vite 资源字段提供 250 ms 防抖服务端搜索和手工 ID 回退，并继续保持独立动态 chunk；
- Realtime 收到 Vite 能产生的窄操作时直接更新本地快照，远端 undo/redo 作为正常逆操作传播；
  subblock 的 `expectedValue` 不匹配或本地存在未保存修改时停止套用并显示冲突。各客户端仍保留
  自己的历史栈，不把“逆操作可同步”误称为“共享历史栈”。服务端广播现已保留发起端
  `operationId`，为幂等提供稳定身份。进一步核对原 Next 语义后，Vite 已把远端操作重放到 undo/redo
  快照：无关历史继续保留，同一字段被远端覆盖后形成的空步骤自动剪除，远端删除导致失效的实体
  不会被本地撤销意外恢复；
- Home Tool Call 继续采用原 Next 的统一生命周期行，不存在每个 Provider 一套独立结果卡片。
  Vite 使用浏览器安全 Catalog 将 4,235 个 capability 映射为集成品牌和操作名，支持代理
  `call_integration_tool`，并提供单次允许、本次聊天允许、始终允许和跳过；Browser/Terminal
  继续使用独立动态交互；
- Home 与 Editor 都保留 `?runtime=next`，作为真实数据库、Desktop、Worker/Realtime 和生产部署
  验收完成前的兼容回退。

Node 22.20、隔离 Vite 缓存的确定性夹具旅程结果：

| 路由 | 服务就绪 | 隔离缓存编译冷可用 | 编译后页面冷可用 | 10 次热刷新 P95 |
| --- | ---: | ---: | ---: | ---: |
| Home（三轮中位） | 536 ms | 2,238 ms | 996 ms | 最差轮 921 ms |
| Editor Shell（三轮中位） | 544 ms | 1,708 ms | 470 ms | 最差轮 917 ms |

Home 和 Editor 各执行了三轮独立冷缓存，六轮全部通过。紧接默认 4 GiB heap 的全量 TypeScript
OOM 后曾出现一次 Vite ready 2,508 ms；该轮页面冷可用 1,000 ms、热刷新 P95 907 ms、RSS
376,168,448 bytes，只有内部更严格的 2 秒 ready 探针失败。随后三轮 Home ready 为
529/537/536 ms、三轮 Editor 为 652/544/529 ms，未复现该波动；失败和通过报告均保留，
没有只挑最快结果。

完成协作历史重放和 Catalog 品牌 Tool Call 后，又执行了一轮隔离缓存回归：Home ready 598 ms、
冷编译可用 6,102 ms、编译后可用 1,010 ms、热刷新 P95 918 ms、RSS 376,541,184 bytes；Editor
分别为 524 ms、2,252 ms、469 ms、912 ms、367,157,248 bytes，均通过确定性门槛。这一轮只用于
确认新增的动态功能没有破坏秒级路径，不替代上面的三轮基线，也不作为真实后端 SLA。

当前构建的默认入口为 61.26 KiB gzip；Editor Shell 6.70 KiB、通用配置面板 2.57 KiB、
核心与 Provider 资源选择器 2.46 KiB、深层 Builder 4.05 KiB、共享 Tool capability 目录 25.58 KiB、结构化 HITL
表单 2.03 KiB、Tool Catalog 14.16 KiB、创建模板分片 13.42–33.63 KiB、运行面板 2.70 KiB、
Realtime Bridge 1.90 KiB、Socket.IO 客户端
12.88 KiB、Desktop Resource Panel 1.47 KiB、Tool Call 品牌与审批面板 1.49 KiB、Tool Action 0.50 KiB，非首屏能力均为
独立异步 chunk。16 个 Workspace Vitest 文件共 56 个用例通过，
Workspace 独立类型检查、
边界检查和生产构建通过。全量 `apps/sim` 在 Node 默认约 4 GiB heap 下两次无诊断 OOM；使用
`--max-old-space-size=8192` 后以 0 个诊断通过，本轮缓存后复核耗时 14.800 秒；此前 extended diagnostics
报告使用约 6,879,447 KiB。该值属于全量编译器类型图，不是开发服务 RSS；但它证明类型门禁
本身仍是重型任务，不应与冷启动性能采集并行运行，也不能把默认 heap 检查标成通过。

Playwright 旅程确认 Home Advanced 动态面板、Vite Editor 两节点画布、313 项 Catalog
及 Slack 搜索可用；Editor 旅程确认节点重命名、启停、移除/重建连线和保存状态，并完成
“搜索 Catalog → 新增 API Block → 填写 URL/Method → 连线 → 保存”的端到端验证。
普通浏览器没有 Sim Desktop bridge 时资源面板会明确显示 unavailable；桌面原生窗口的最终
验收仍需在 Sim Desktop 中执行。

### 研发完成与客户环境验收范围

- Workflow Editor 已完成 313/313 个 Block/Trigger 创建、通用 Basic/Advanced 配置、上传、
  11 类结构化可视 Builder、Loop/Parallel、草稿全流程与选中节点运行/恢复、服务端取消、通用
  与结构化 pause context 恢复、部署/下线、版本恢复、执行详情、核心资源选择、Table/Tool/Skill/
  MCP 深层 Builder、Credential 与 Provider Selector、冲突感知逐操作同步、本地 undo/redo、远端逆操作
  应用及每用户历史重放/剪枝。原 Next 同样采用每用户本地撤销栈，不需要全局 revision/operation-log；
- Browser/Terminal、语音、上传、完整审批决策和带 Catalog 品牌的 Tool Call 生命周期已迁入 Vite。
  代码、类型、构建和确定性门禁层面的功能迁移已收口；真实 Sim Desktop、Provider、Worker/Realtime
  回归作为客户环境验收项交付；
- 固定账号、workspace/workflow、三轮冷启动、热刷新、关键 API 与 RSS 的严格采集器已经实现。
  交付方当前没有客户 `DATABASE_URL` 和可验证账号，因此真实数据由客户按验收手册采集；该限制
  不再标记为研发未完成，但确定性 fixture 数据也不会冒充客户环境 SLA；
- Next 原完整模式的冷启动和 RSS 门槛仍未通过，也不再作为 Workspace 默认性能路径；
- `dev:full:vite` 是性能专项入口；默认 `dev:full` 仍保留原 Next 完整功能；
- 生产网关配置和 Node 22 镜像已实现；镜像构建、部署级 WebSocket、Cookie、上传和健康检查
  由客户在其 Docker 环境验收；
- `WORKSPACE_NEXT_FALLBACK` 默认保持 `1`，这是已完成的交付安全策略。客户验收通过后可按
  运行手册切换为 `0`，无需修改迁移实现。

真实三轮测试在交付方环境没有执行，不是因为遗漏了实现或测试步骤。严格采集器会先运行 readiness：当前 Node
进程没有 `DATABASE_URL`，仓库根目录也没有 `.env*`；虽然 `.perf/auth/storage-state.json` 与固定
journey 文件存在，但二者最后写入于 2026-07-30，无法在无数据库连接时验证账号会话、workspace 和
workflow 仍有效；当前机器同时没有 Docker CLI/Daemon，Sim Desktop bridge 也未就绪。采集器因此在
发出第一条性能请求前 fail-fast。强行跳过预检只会把数据库失败、失效登录或缺失 Desktop 能力记录成
页面耗时，不能作为真实 SLA 证据，所以确定性 fixture 与客户真实验收始终分开报告。项目以
“研发交付完成、客户环境验收待执行”的状态交付。

## 10. 停止零散 Next 优化后的落地决策

Next 受控对照满足停止条件：冷路由远超 10 秒，完整模式 RSS 超过 4 GiB，webpack 也无法
在 120 秒浏览器超时内完成 Home 首次编译。因此没有继续零散调整 Next 配置，而是实施：

```text
Next 3000
  保留登录、SSR/兼容页面和未迁移写接口

Workspace Vite 5173（仅开发）
  独立 React 入口，不导入 apps/sim、Next 或任何 @sim 服务端包

Node API 3012
  GET /api/workspace-bootstrap
  一次鉴权、一次 workspace 授权、四组数据库查询并行执行

Production Gateway 3000
  同域提供 Vite 静态资源，转发 API 和 WebSocket；不暴露 5173
```

Next 在 `SIM_WORKSPACE_VITE_URL` 存在且请求未携带 `runtime=next` 时把 Workspace Home
重定向到 Vite；`runtime=next` 是迁移期完整功能兼容入口。Vite 对
`/api/workspace-bootstrap` 单独代理到 Node API，其余尚未迁移的 `/api` 继续代理到 Next，
所以本阶段不改变既有产品写接口、Tool/Block/Trigger ID 或历史 Workflow 格式。

新增门禁确保 Vite 源码不能导入 `next`、`@/`、`@sim/*` 服务端实现、Node 内置模块或
逃逸到 `apps/sim`；只允许 `@sim/tool-catalog` 的 type-only contract 和生成 JSON，
并强制 creation template 保持动态分片。CI 同时执行边界检查、独立类型检查和 Vite
生产构建。

开发与验证命令：

```powershell
bun run dev:full:vite
bun run check:workspace-vite
bun run perf:workspace:vite
bun run perf:workspace:readiness
bun run perf:workspace:real
```

真实后端验收需要 `DATABASE_URL`、认证 storage state、固定 workspace/workflow，并以完整
注册表执行三轮。缺少任一前置条件时脚本直接失败，不生成“通过”结果：

```powershell
bun run perf:dev:seed
bun run perf:dev:prepare
bun run perf:workspace:real
```

`perf:workspace:readiness` 会生成不含密钥的机器可读前置报告。本机当前结果为：
storage state、固定 workspace/workflow、Node 22 和完整注册表已就绪；`DATABASE_URL`、
Sim Desktop 实机确认、Docker CLI/daemon 尚未就绪，因此真实 SLA、桌面和生产部署验收
仍保持 blocked。

无论选择哪种方案，都必须保持：

- 产品 HTTP API 不变；
- Tool、Block、Trigger ID 不变；
- Integration 功能集合不变；
- 历史 Workflow JSON 格式不变；
- Runtime Registry 仍只在 Worker 执行侧加载。

## 11. 提交阶段

| 提交 | 内容 |
| --- | --- |
| `f572ac4f` | 新增受控启动与浏览器性能旅程 |
| `7f42f1a7` | 四服务统一 Node 22 运行时 |
| `b274ae18` | 收窄首批客户端依赖闭包 |
| `f4c9a7d4` | 记录 Node 22 与 Next 性能 ADR |
| `2e8c4dd7` | 汇总开发性能解决方案 |
| `0d0eaf7b` | 修复 Resume 页面 6 个类型错误 |
| `c7f7ad4d` | 修复 Node 22 SLA 采集可重复性 |
| `8675dd57` | 延迟可选依赖并预生成 Tailwind |
| `2bbba150` | 回收隔离的 Next 性能缓存 |
| `2336b18d` | 延迟 Auth 非临界依赖 |
| `cdb9cfad` | 持久化失败的 SLA 轮次 |
| `bbaf79bc` | 记录受控 Node 22 SLA 失败证据 |

## 12. 相关文档

- [开发性能解决方案](../architecture/node22-development-performance-solution.md)
- [问题清单与根因报告](../reviews/node22-development-performance-root-cause.md)
- [Node 22 与 Next 性能边界 ADR](../architecture/decisions/ADR-0005-node22-next-development-performance-boundary.md)
- [Workspace Vite 渐进式前后端分离 ADR](../architecture/decisions/ADR-0006-workspace-vite-progressive-separation.md)
- [性能重构运行手册](./node22-development-performance-runbook.md)
- [机器可读性能证据](../testing/evidence/node22-development-performance.json)
- [平台分离与迁移 Spec](../specs/sim2-platform-separation-and-polaris-migration.md)

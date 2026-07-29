# 建立目标工程拓扑与包级边界

What to build: 按 Spec 创建 Web、API、Worker、packages、Biz 与 Infra 的最小可构建目录和 workspace 配置。
Blocked by: 01
Status: in-progress

## What to build

以最小可构建入口建立目标拓扑，不迁移业务行为；保留 `apps/sim` 作为 Next Web 与兼容门面。
本 ticket 只建立真实 workspace/module root，不为尚未迁移的行为批量创建空叶目录；叶目录由
拥有该行为的后续 ticket 按 Spec 创建。

## Acceptance criteria

- Spec 列出的所有顶层工程和 workspace/module root 均存在，workspace/turbo/tsconfig 能发现它们。
- 结构校验脚本验证 module root、package manifest、Node runtime contract 与禁止的同义 app
  目录；规范性叶目录由对应迁移 ticket 验收，禁止使用成百上千个 `.gitkeep` 伪造模块。
- `apps/api` 与 `apps/worker` 可独立安装、类型检查、测试和启动。
- 新 package/extension 使用规定的 exports 与内部布局，不建立同义目录。
- 原 `apps/sim` 行为与生产构建不受影响。

## Blocked by

01。

## Implementation evidence

- 已建立 `apps/api`、`apps/worker`、`apps/content-processor`、四个 contract/catalog/SDK
  package、7 个 Biz 与 7 个 Infra workspace root；
- `bun install --frozen-lockfile --offline --ignore-scripts` 通过；
- 20 个新 workspace type-check 通过，API/Worker 共 2 个测试通过、2 个 Node target build
  通过；
- API 与 Worker 构建产物已分别用 Node 启动并验证 shutdown handler；
- 结构门禁验证 33 个 module root、15 个必需文件、Node 22.19+ runtime contract 和禁止的
  同义 app 目录。

尚未完成：完整 `apps/sim` 冷构建需要约 51 GB 内存，留给既有 Build App CI runner 验证；
在该 CI 结果可取得前，本 ticket 不标记完成。

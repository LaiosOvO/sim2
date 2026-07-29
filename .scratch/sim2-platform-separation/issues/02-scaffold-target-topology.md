# 建立目标工程拓扑与包级边界

What to build: 按 Spec 创建 Web、API、Worker、packages、Biz 与 Infra 的最小可构建目录和 workspace 配置。
Blocked by: 01
Status: ready-for-agent

## What to build

以空实现和最小入口建立目标拓扑，不迁移业务行为；保留 `apps/sim` 作为 Next Web 与兼容门面。

## Acceptance criteria

- Spec 列出的所有顶层工程和规范性文件夹均存在，workspace/turbo/tsconfig 能发现它们。
- `apps/api` 与 `apps/worker` 可独立安装、类型检查、测试和启动。
- 新 package/extension 使用规定的 exports 与内部布局，不建立同义目录。
- 原 `apps/sim` 行为与生产构建不受影响。

## Blocked by

01。

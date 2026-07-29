# ADR-0003：按 Infra / Biz 分类扩展，但以 Interface 强制单向依赖

- Status: `accepted-for-implementation`
- Date: 2026-07-25
- Owner Spec: `SPEC-07`
- Related Specs: `SPEC-00`、`SPEC-01` 至 `SPEC-06`

## 1. 决策

Polaris 采用 Activepieces-Moirai 的 `infra` / `biz` 分类思想，但不复制其源码间的直接依赖方式。
平台形成三个清晰层次：

1. **Platform Core**：Sim 产品核心、Polaris Extension Host、鉴权、执行、版本、审计和通用
   Interface；不是普通扩展；
2. **Infra Extension**：飞书、Meegle、对象存储、向量库、代码托管、模型和消息队列等可复用技术能力；
3. **Biz Extension**：Project、Document、MAT、Approval、People、Task/Todo、Risk、Release 和具体
   行业方案等业务真相与工作流。

依赖方向固定为：

```text
Biz Extension
      ↓ requires capability Interface
Infra Extension
      ↓ implements capability Interface
Platform Core / Extension SDK
```

实际装配发生在唯一 Composition Root。Infra 不得 import Biz；Biz 不得 import Infra 的具体文件、
SDK Client、Entity 或 Repository。

## 2. 为什么参考 Moirai，但不原样照搬

核对的是 `activepieces-moirai` 的 `origin/kimi` 和 `origin/feat/xpert-fusion` 分支；当前 `main`
工作树没有完整的服务端 `extension/infra`、`extension/biz` 源码。

### 2.1 值得采用的部分

- `extension/infra/feishu-im`、`file-storage`、`knowledge`、`llm`、`mq`、`org-structure` 把可复用
  技术能力集中起来；
- `extension/biz/hr/offboarding-flow`、`offboarding-case` 和 `biz/nl-workflow` 把具体业务流程集中；
- `cardActionRegistry`、`messageHandlerRegistry` 展示了“基础设施提供分发点、业务注册处理器”的正确
  方向；
- 目录可读性强，开发者能快速判断新增能力属于连接器还是业务域。

### 2.2 必须避免的架构侵蚀

1. `infra/agent/demand-agent-construction.service.ts` 直接 import `biz/nl-workflow`；
2. `infra/nl-authoring` 直接 import `biz/nl-workflow` 的实体；
3. `infra/feishu-im` 出现 `mat-*` 文件，使通用飞书能力知道 MAT 业务；
4. `biz/hr/offboarding-flow` 大量直接 import Infra 的 concrete service、entity 和环境变量；
5. 进程内 registry、去重 Set 和临时 stash 在多实例或双 WS 连接下会产生状态分裂。

这些问题说明目录名本身不是 Seam。只有依赖规则、Interface、运行时装配和持久化约束同时存在，
`infra` / `biz` 才是有效模块边界。

## 3. 推荐工程结构

```text
polaris/
├── apps/sim/
│   └── lib/polaris/
│       ├── platform/                 # Outbox、幂等、artifact、audit、policy
│       ├── extensions/               # registry、review、loader、runtime、migration
│       ├── contracts/                # 平台稳定 Interface 与事件，不含具体实现
│       └── composition/              # 首期硬编码内置包；后续由动态 loader 生成
├── packages/
│   └── polaris-extension-sdk/        # 公开 Manifest、Interface、Schema、test kit
└── extensions/
    ├── infra/
    │   ├── feishu-channel/
    │   ├── meegle-connector/
    │   ├── object-storage/
    │   ├── vector-search/
    │   └── code-host/
    └── biz/
        ├── identity/
        │   ├── users/
        │   ├── external-identities/
        │   ├── organization/
        │   └── access-bindings/
        ├── pm/
        │   ├── projects/
        │   ├── memberships/
        │   ├── stages/
        │   ├── documents/
        │   ├── context/
        │   ├── mat/
        │   └── workflow-bindings/
        ├── approval/
        ├── delivery/
        │   ├── tasks/
        │   ├── risks/
        │   └── notifications/
        └── operations/
            ├── releases/
            └── schedules/
```

首期无需马上物理移动所有代码。可以继续放在 `apps/sim/lib/polaris/<domain>`，但每个内置模块必须
声明等价的 `kind/provides/requires`，由 `composition/internal-extensions.ts` 硬编码装配。等首个
内部扩展跑通后，再机械迁移到 `extensions/infra` 或 `extensions/biz`。

`infra` / `biz` 是扩展类别，`identity` / `pm` / `approval` / `delivery` / `operations` 才是
业务边界。不能为每个菜单、页面或节点新建一个顶层扩展包；同一业务真相应收敛在同一领域包中。
Project、Project Member、Stage、项目文档、上下文、MAT 和 Workflow Binding 由 `pm` 拥有；
用户、人员、组织、外部身份映射以及角色/数据权限绑定由 `identity` 拥有。

每个领域包内部继续按 `domain/application/infrastructure/api/ui-schema/extension/tests` 分层，并用
子模块隔开聚合。只有需要独立安装、独立版本或独立权限边界时，才把子模块提升成新的扩展包。

### 3.1 领域所有权

| 领域 | 唯一拥有的数据/规则 | 可以引用的外部标识 |
| --- | --- | --- |
| `identity` | User、Person、Organization、ExternalIdentity、Role、MenuGrant、DataScopeBinding | Feishu/OpenID 等只作为外部身份值 |
| `pm` | Project、ProjectMembership、Stage、Document、ContextPolicy、MAT、WorkflowBinding | `subjectId`、`workflowId`、`artifactRef` |
| `approval` | ApprovalDefinition、ApprovalInstance、Decision、WaitSubscription | `subjectId`、`businessRef`、`runId` |
| `delivery` | Task、Todo、Risk、NotificationPolicy | `projectId`、`subjectId`、`businessRef` |
| `operations` | Release、Schedule、SyncJob、OperationRun | `projectId`、`artifactRef`、`providerRef` |

`ProjectMembership` 归 `pm`，因为它表达“某人在某项目中的参与关系”；人员是谁、属于哪个组织以及
拥有什么平台角色仍归 `identity`。PM 表只保存 `subjectId`，不能复制或修改身份主数据。

## 4. 两类扩展的职责

### 4.1 飞书能力的唯一扩展边界

飞书通讯录导入、飞书 OAuth/SSO、`open_id/union_id/user_id` 解析、Bot Trigger、消息归一化、
通知和卡片投递统一由 `extensions/infra/feishu-channel` 提供。它们是一个 Provider 的多项
capability，不拆成 `feishu-auth`、`feishu-identity`、`feishu-notification` 等平行安装包。

这不改变业务真值归属：Feishu 扩展只翻译厂商协议和外部身份；平台 User、Subject、Role、
MenuGrant、DataScopeBinding 仍由 `biz/identity` 写入，Notification/Approval/Project/MAT/
Assignment 状态仍由各 Biz 领域写入。Biz 只能依赖公开 capability，不能 import Feishu SDK 或
Feishu concrete adapter。

| 维度 | Infra Extension | Biz Extension |
| --- | --- | --- |
| 目标 | 提供可复用技术能力 | 管理业务真相和业务流程 |
| 典型贡献 | Credential、Tool、Trigger、Transport Adapter、Settings integration page | Menu、Page、Permission、业务 Block、Workflow template、规则和领域事件 |
| 数据 | 连接、游标、投递、技术索引、缓存 metadata | Project、MAT、Approval、Task、Risk、Release 等业务聚合 |
| 可依赖 | Extension SDK、Platform Interface、外部厂商 SDK | Extension SDK、Platform Interface、其他扩展公开 capability |
| 禁止 | import Biz、出现 MAT/离职等业务判断 | import 厂商 SDK、读取 Infra 表、import concrete adapter |
| 测试 | contract、provider、故障、重试、幂等 | domain、application、权限、业务 E2E |

“飞书发送消息”属于 Infra；“发送 MAT 审核卡并改变 MAT 审核状态”属于 Biz。Biz 只调用
`MessagingPort.sendCard()`，卡片业务内容和状态转移留在 Biz。

## 5. Extension Manifest

公开 Schema 增加：

```ts
type ExtensionKind = 'infra' | 'biz'

interface CapabilityRequirement {
  capability: string
  versionRange: string
  optional?: boolean
}

interface PolarisExtensionManifest {
  id: string
  version: string
  kind: ExtensionKind
  provides: Array<{
    capability: string
    version: string
    interfaceSchema: string
  }>
  requires: CapabilityRequirement[]
  contributions: {
    credentials?: unknown[]
    tools?: unknown[]
    triggers?: unknown[]
    blocks?: unknown[]
    menus?: unknown[]
    pages?: unknown[]
    permissions?: unknown[]
    migrations?: unknown[]
  }
}
```

示例：

```ts
defineExtension({
  id: '@polaris/infra-feishu-channel',
  kind: 'infra',
  provides: [
    { capability: 'channel.inbound', version: '1.0.0', interfaceSchema: 'channel-event@1' },
    { capability: 'messaging.outbound', version: '1.0.0', interfaceSchema: 'message-command@1' },
  ],
  requires: [],
})

defineExtension({
  id: '@polaris/biz-pm',
  kind: 'biz',
  provides: [
    { capability: 'business.pm', version: '1.0.0', interfaceSchema: 'pm-command@1' },
    { capability: 'business.mat', version: '1.0.0', interfaceSchema: 'mat-command@1' },
  ],
  requires: [
    { capability: 'identity.subject-directory', versionRange: '^1.0.0' },
    { capability: 'channel.inbound', versionRange: '^1.0.0', optional: true },
    { capability: 'messaging.outbound', versionRange: '^1.0.0', optional: true },
  ],
})
```

Loader 在启用前解析 capability DAG：

- 缺少 provider：拒绝启用；
- 版本不兼容：拒绝启用；
- 循环依赖：拒绝启用；
- 一个独占 capability 出现多个 provider：要求管理员明确选择；
- 停用 provider：先计算受影响 Biz Extension 和已发布 Workflow，禁止静默破坏。

## 6. Interface 与装配

```ts
interface MessagingPort {
  send(command: MessageCommand): Promise<MessageReceipt>
}

interface InboundChannelPort {
  ingest(envelope: ProviderEnvelope): Promise<InboundReceipt>
}

interface ArtifactStorePort {
  put(input: ArtifactInput): Promise<ArtifactRef>
  get(ref: ArtifactRef, auth: AuthorizationContext): Promise<ArtifactStream>
}
```

Interface 只表达平台需要的稳定语义，不照抄飞书、Meegle 或 S3 SDK。Composition Root 将
`FeishuMessagingAdapter` 绑定到 `MessagingPort`；测试绑定 `FakeMessagingAdapter`。这是一个真实
Seam，因为至少存在生产 Adapter 和测试 Adapter，并且未来还有钉钉/企业微信 Adapter。

业务模块使用一个深 Module Interface，例如：

```ts
interface MatModule {
  generate(command: GenerateMatCommand): Promise<MatRunRef>
  review(command: ReviewMatCommand): Promise<MatVersionRef>
}
```

调用者不需要知道 MAT 的 Repository、飞书、向量库、对象存储和工作流细节。

## 7. 依赖规则

以下规则进入静态检查：

1. `extensions/infra/**` 不得 import `extensions/biz/**`；
2. `extensions/biz/**` 不得 import `extensions/infra/**`；
3. 两类扩展只能 import `polaris-extension-sdk`、自身目录和 allowlist 第三方库；
4. 具体 Adapter 只能在 Composition Root 被引用；
5. Biz Extension 之间只通过公开 Interface 或领域事件协作；
6. 扩展不得 import Sim 内部 store、executor implementation 或私有 React Hook；
7. 跨扩展不得直接读表、Entity 或 Repository；
8. 业务名不得出现在 Infra 包中，由 lint/命名规则和 Reviewer 检查。

首期增加 `check:extension-boundaries`，后续由 Manifest 构建图和 TypeScript import graph 双重验证。

## 8. 与飞书 Trigger 的映射

```text
extensions/infra/feishu-channel
  ├─ HTTP / WS Transport Adapter
  ├─ 验真、解密、ACK、NormalizedChannelEvent
  ├─ Credential、Feishu Bot Trigger contribution
  └─ 飞书发送 Tool

extensions/biz/pm
  ├─ 群 ↔ Project 绑定
  ├─ Project 数据权限
  ├─ workflow_run 与 Project / Stage / MAT 关联
  └─ MAT 群反馈、审核和返修业务规则

extensions/biz/approval
  ├─ Channel Route
  ├─ workflow_run / wait subscription / mailbox
  └─ Wait for Channel Event Block 与审核状态机
```

因此 `infra/feishu-channel` 永远不知道 MAT。它只产生标准事件和消息回执；MAT 如何解释群消息由
`biz/pm` 决定。飞书人员目录和 OAuth 同理：厂商协议在 Infra Adapter，用户、组织和外部身份映射
归 `biz/identity`。

## 9. 安装、停用与迁移顺序

```text
审核全部扩展 artifact
→ 校验 Manifest 和 capability DAG
→ 按拓扑序执行已审核 CREATE-only migration
→ 启用 Infra providers
→ 启用 Biz modules
→ 注册 UI/Block/Tool/Trigger contributions
→ 健康检查
→ 原子发布 installation graph
```

停用顺序相反。若 Biz 或已发布 Workflow 仍依赖某个 Infra provider，只允许“禁止新运行”的
draining 状态，不能直接卸载。

## 10. 验收

1. 安装 `infra-feishu-channel` 后出现 Credential、发送 Tool 和 Bot Trigger，不出现 MAT 菜单；
2. 安装 `biz-pm` 时缺少必需的 `identity.subject-directory` provider，系统明确拒绝；
3. 安装 Identity 后可启用 PM；没有 Channel provider 时项目和 MAT 可用，但飞书群路由/卡片贡献隐藏；
4. Infra 源码 import Biz 时 `check:extension-boundaries` 失败；
5. Biz 直接 import 飞书 SDK 或 Infra concrete 文件时检查失败；
6. Manifest 人为制造循环依赖时安装失败并显示完整环；
7. 同一 Biz 测试可使用 Fake Channel/Messaging Adapter，不启动飞书；
8. 停用飞书 Infra 前能列出受影响的 Biz、Workflow 版本和运行；
9. 飞书收到群消息后，Infra 只保存标准事件，MAT 状态只能由 Biz handler 改变；
10. 首期硬编码内部扩展和未来 Git 动态扩展产生相同 installation graph。

## 11. 明确拒绝

- 只创建两个“大杂烩”目录，把所有技术代码放 `infra`、所有其余代码放 `biz`；
- 用目录层级代替 Manifest capability 和依赖检查；
- Infra 通过 registry callback 或相对路径 import Biz；
- Biz 直接调用 concrete Infra service；
- 为每个小函数都创建 Port；只有真实变化点或测试替身需要 Seam；
- 首期为了目录完美大规模移动 Sim/Polaris 代码，增加无业务价值的冲突。

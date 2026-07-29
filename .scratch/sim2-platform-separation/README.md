# Sim2 前后端分离与 Polaris 迁移 Tickets

本目录把正式 Spec 拆成可独立验收的实施单元。正式需求与工程目录以
`docs/specs/sim2-platform-separation-and-polaris-migration.md` 为准；接口边界以
`docs/architecture/api-migration-inventory.md` 的 1,126 条 `API-nnnn` 记录为准。

## 执行规则

- 只在 `D:\workspace\workflow\sim2-refactor` 实施。
- `D:\workspace\workflow\sim2` 仅作 Sim2 upstream 参考，`D:\polaris` 仅作行为与测试 donor。
- 每个接口迁移必须完成清单中标注的测试类别；没有测试证据不得将 ticket 标记为完成。
- 每个波次必须生成 machine-readable coverage report，证明其筛选结果与预期数量一致、无重复、无遗漏。
- Next Web 只能依赖浏览器安全 contract/catalog；Runtime Registry、Executor、Sandbox、密钥与具体 Infra SDK 不得进入客户端闭包。
- 每个阶段通过测试后独立 commit 并 push；提交信息包含阶段编号与覆盖 ticket。
- 接口旧实现只有在 differential、回滚与观测门槛全部通过后才能移除。

## API 覆盖分区

| Wave | Tickets | Route 数 |
| --- | --- | ---: |
| W1 | 07 | 3 |
| W2 | 10–12 | 22 + 36 + 37 = 95 |
| W3 | 13–19 | 30 + 40 + 46 + 36 + 52 + 36 + 23 = 263 |
| W4 | 21–28 | 77 + 124 + 47 + 92 + 74 + 10 + 91 + 40 = 555 |
| W5 | 29 | 29 |
| W6 | 30–31 | 6 + 5 = 11 |
| W7 | 32–34 | 29 + 11 + 21 = 61 |
| W8 | 35、37–41 | 16 + 52 + 8 + 9 + 23 + 1 = 109 |
| **总计** |  | **1,126** |

Ticket 20 是 W4 生成器与测试框架，不额外占用 API；Ticket 36 是 Feishu/Meegle Infra
前置能力，不额外占用 W8 API。Ticket 42–46 负责 Polaris 非路由能力、Replay/Debug、
全量闭环、upstream 同步演练与最终交付。

## 阶段与依赖主线

1. Phase 0：01。
2. Phase 1：02–03。
3. Phase 2：04–09。
4. Phase 3：10–19。
5. Phase 4：20–28。
6. Phase 5：29–34。
7. Phase 6：35–42。
8. Phase 7：43–46。

同一阶段中只有 `Blocked by` 已完成的 ticket 才能进入工作前沿。

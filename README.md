# dreammate-network

> DreamMate Network 的 **L0 协议包**：schema + types，零依赖，**不含业务逻辑**。
> 版本 0.1.0 ｜ 状态：草案

判断改动该不该进这个包，只看一条：

> 它是所有 repo 都要共用的**词汇**，还是某一方的**行为**？
> 是词汇 → 进来。是行为 → 出去。

## 内容

```
dreammate-network/
├── schemas/                    JSON Schema (draft 2020-12)，唯一事实源
│   ├── node.schema.json
│   ├── service.schema.json
│   ├── execution.schema.json
│   └── session-ref.schema.json
├── typescript/types.ts         上述 schema 的 TS 投影，纯类型
├── docs/protocol.md            协议正文
└── package.json
```

## 用

```ts
import type { NodeManifest, Execution, SessionURI } from "dreammate-network";
```

Go / Swift 侧读同一份 `schemas/*.json`。详见 [`docs/protocol.md` §9](docs/protocol.md)。

## 三条不能破的规则

| 规则 | 破了会怎样 |
|------|-----------|
| **Node ≠ Agent** | 无 Agent 的录音硬件就进不了网络 |
| **Capability ≠ Resource** | 调度侧与检索侧路径缠在一起 |
| **Execution 不含 `task_id`** | 体外循环（想到了直接干）变成非法状态 |

## 依赖规则

```
L4 ──→ L3 ──→ L2 / L1 ──→ L0

✅ 任何层都可以 import L0
❌ L0 不 import 任何人
```

一条实操检查：**如果 A 需要 `go.mod replace` 或 `file:../` 才能用 B，说明 A 和 B 没解耦。**

## 出处

设计册是 1agents 工作区里的 `docs/architecture/dreammate-network/`（10 篇，不随本包发布）。
本包对应其中迁移步骤 **S1**（09-仓库拆分与依赖边界 §8）。

下一步是 **S2**（`modules/*` 上移）与 **S3**（session-reader 加 `1session serve` + `/manifest`）——
S1–S3 就足够跑出 M1 + M2，不需要等全部拆完。

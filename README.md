# dreammate-network

> DreamMate Network 的 **L0 协议包**：schema + TypeScript 类型，零运行时依赖，**不含业务逻辑**。
> 版本 **0.5.0** ｜ 状态：**已发布**（npm: `@1agents/dreammate-network`）
>
> 这不是 Agent Network，是 Capability Network —— 让设备和软件向智能体公开自己的能力。
> **登记、发现、执行调用** 由 `@1agents/dreammate-node` 承担；本包只提供共用词汇。

判断改动该不该进这个包，只看一条：

> 它是所有 repo 都要共用的**词汇**，还是某一方的**行为**？
> 是词汇 → 进来。是行为 → 出去。

## 是什么

四个 JSON Schema + 一份 TS 类型投影，把跨设备、跨语言、跨 Agent 运行时需要共识的所有对象写成公共语言：

| 概念 | 干什么 |
|---|---|
| **Node** | 在哪里执行；从 tailnet 取身份 |
| **Service** | Node 上的一组能力聚合；声明 `methods` / `skills` / `resources` / `access` |
| **Capability** | 能做什么（点分命名，如 `transcript.read`） |
| **Resource** | 拥有什么（声明 URI scheme，如 `recording://…`） |
| **Execution** | 现实中发生的一次工作行为 |
| **Session** | 这一次的工作上下文（`session://<node>/<runtime>/<session_id>`） |

Graph 的边（`references` / `initiates` / `opens` / `delegates` / `produces` / `accesses`）由调用事件实时写入，不靠后台扫库猜 DAG。

## 内容

```
dreammate-network/
├── schemas/                       JSON Schema (draft 2020-12)，唯一事实源
│   ├── node.schema.json           NodeManifest
│   ├── service.schema.json        Service / AccessDescriptor / MethodDescriptor / SkillDescriptor
│   ├── execution.schema.json      Execution
│   └── session-ref.schema.json    SessionRef（图的边）
├── typescript/types.ts            上述 schema 的 TS 投影，与 schema 一一对应
├── docs/protocol.md               协议正文（设计、约定、示例）
└── package.json
```

`schemas/` 与 `typescript/types.ts` **必须同步修改**。types.ts 顶部导出
`PROTOCOL_VERSION`，与 `package.json` 版本号一致 —— 两个版本号会让人永远猜不准该看哪个。

## 怎么用

**TypeScript**：

```ts
import type {
  NodeManifest,
  Service,
  MethodDescriptor,
  Execution,
  SessionURI,
} from "@1agents/dreammate-network";

const manifest: NodeManifest = {
  node_id: "scott-mac-01",
  name: "scott-mac",
  type: "macos",
  services: [
    {
      id: "transcripts",
      methods: {
        read: {
          description: "读取一条转写记录",
          parameters: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        } satisfies MethodDescriptor,
      },
      access: [
        { protocol: "mcp",  tool: "transcript_read", server: "transcripts" },
        { protocol: "http", endpoint: "GET /transcripts/:id" },
        { protocol: "cli",  command: "tingqi transcript get" },
      ],
      port: 7777,
    },
  ],
};
```

**Go / Swift / 其他语言**：读同一份 `schemas/*.json`，手写或代码生成对应结构体。
schema 是唯一事实源。

**校验 manifest**（任意 JSON Schema draft 2020-12 校验器都行）：

```bash
npx -p ajv-cli@5 -p ajv-formats@2 ajv validate --spec=draft2020 -c ajv-formats \
  -s schemas/node.schema.json -r schemas/service.schema.json -d your-manifest.json
```

每个 schema 自带 `examples`，可以直接抽出来当冒烟用例跑。

## 不能破的规则

| 规则 | 破了会怎样 |
|------|-----------|
| **Node ≠ Agent** | 无 Agent 的录音硬件就进不了网络 |
| **Capability ≠ Resource** | 调度侧（`invoke`）与检索侧（`search` / `read`）路径缠在一起 |
| **Execution 不含 `task_id`** | 体外循环（想到了直接干）变成非法状态 |
| **`protocol` 不写进数据模型** | 数据模型里不存在「MCP Capability / HTTP Capability」，传输方式只出现在 `access[]` |

## 依赖规则

```
L4 ─→ L3 ─→ L2 / L1 ─→ L0

✅ 任何层都可以 import L0
❌ L0 不 import 任何人
```

一条实操检查：**如果 A 需要 `go.mod replace` 或 `file:../` 才能用 B，说明 A 和 B 没解耦。**

## 三个约定端口

发现是 pull 的（Control Plane 探测节点的 `/manifest`），所以「哪个服务在哪个端口」必须是公共词汇：

| 端口 | 服务 | 层 |
|---|---|---|
| **`36908`** | **`@1agents/dreammate-node`（node-agent，本机唯一入口）** | **基础设施** |
| `7777` | `session-registry`（session-reader） | L2 |
| `7778` | `data-service` | L2 |
| `7779` | `control-plane` | L3 |
| `7780+` | Resource Provider 等扩展 L2 服务 | L2 |

详见 [`docs/protocol.md` §6](docs/protocol.md)。这是**默认值，不是强制**：服务可以跑在别的端口，代价是探测发现不了它，得由它自己 `POST /nodes/register` 告知。

## 第一个 Service 例子

```json
{
  "id": "transcripts",
  "methods": {
    "read": {
      "description": "读取一条转写记录",
      "parameters": {
        "type": "object",
        "properties": { "id": { "type": "string" } },
        "required": ["id"]
      }
    }
  },
  "skills": {
    "new_meeting": {
      "name": "new_meeting",
      "description": "新会议录音到来后的标准处理流程",
      "sop": "1. 等待 transcription 完成 …\n2. …",
      "has_package": true
    }
  },
  "resources": [{ "scheme": "transcript" }],
  "access": [
    { "protocol": "mcp",  "tool": "transcript_read", "server": "transcripts" },
    { "protocol": "http", "endpoint": "GET /transcripts/:id" },
    { "protocol": "cli",  "command": "tingqi transcript get" }
  ],
  "execution": "hybrid",
  "command": "transcribe",
  "port": 7777,
  "reachability": "network"
}
```

要点：

- `methods` 是面向大模型 / RPC 的**结构化契约**（JSON Schema 入参 / 返回）；`skills` 是面向大模型的 **Markdown SOP**，描述多步编排与避坑。
- `access[]` **有序**：靠前优先、靠后 fallback。同一 protocol 可重复出现（先给 MagicDNS 名，再给 tailnet IP，兜住 DNS 被 fake-ip 代理劫持的情况）。
- `reachability: localhost` 只描述服务自己怎么监听 —— 跨节点调用仍走 `node-agent` 的 `POST /services/:id/invoke`，由本机 agent 转发到回环 HTTP / CLI；远端智能体不需要直连服务端口。

## 第一个 Execution 例子

```json
{
  "id": "exec-2026-09-22-001",
  "type": "capability_invocation",
  "created_at": "2026-09-22T10:15:00Z",
  "started_at": "2026-09-22T10:15:00Z",
  "finished_at": "2026-09-22T10:15:00.842Z",
  "status": "completed",
  "node_id": "scott-mac-01",
  "service_id": "transcripts",
  "capability": "transcript.read",
  "resource_uri": "transcript://tingqi-01/abc123",
  "initiated_by_session_id": "session://scott-mac/codex/01a0907c"
}
```

要点：

- **没有 `task_id`**。Task 是独立的 `0..N ↔ 0..N` 关联表（`TaskExecutionLink`）。
- `status` 多了一档 `waiting_for_user` —— 接手机之后必须新增的状态，向用户描述需要他在现实世界做什么。
- `type` 不止 `agent_execution`：`capability_invocation` / `device_job` / `resource_access` / `human_action` 都是一等公民。

## 第一版明确不做

- ❌ 不写任何业务逻辑（本包只是公共语言）
- ❌ Capability 不带 provider / permission / availability 元数据
- ❌ 不做自动服务发现（节点手工配 control-plane）
- ❌ 不做 MCP→CLI→HTTP 自动 fallback 编排
- ❌ 不做 Capability 调度评分
- ❌ 不要求所有能力统一成 MCP
- ❌ 不存 `planned = true/false`（由四个时间事实推导）
- ❌ 不存任务状态字段、不推 `PlanningClass`

## 版本

`PROTOCOL_VERSION = "0.5.0"`，与 `package.json` 同步。v0.x 期间 schema 仍可能破坏性变更，以设计册 06-实施路线图的 M1–M5 验收结果为准收敛。

## 出处

设计册是 1agents 工作区里的 `docs/architecture/dreammate-network/`（10 篇，不随本包发布）。
本包对应其中迁移步骤 **S1**（09-仓库拆分与依赖边界 §8）。

下一步是 **S2**（`modules/*` 上移）与 **S3**（session-reader 加 `1session serve` + `/manifest`）——
S1–S3 就足够跑出 M1 + M2，不需要等全部拆完。
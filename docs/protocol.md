# DreamMate Network Protocol v0.1.0

> L0 协议层。**零依赖，不含业务逻辑。**
> 设计依据：1agents 工作区的 `docs/architecture/dreammate-network/`（10 篇设计册，不随本包发布）
> 本文件只写「协议是什么」，不写「为什么这么设计」——后者在设计册里。

## 1. 定位

**DreamMate Network 不是 Agent Network，是 Capability Network。**

- **Agent** 负责思考与编排
- **设备 / 节点** 负责提供能力与数据
- **Session** 负责留下认知轨迹
- **Execution** 负责记录现实中到底发生了什么
- **Task** 负责表达我们原本想做什么（可选，不是执行的前提）

本包是四层架构里的 L0，所有其他层都可以 import 它，它不 import 任何人：

```
L4  节点宿主  desktop / phone / mini / server
L3  控制面    control-plane
L2  服务      session-reader / data-service / tingqi-adapter
L1  运行时    1acp / HarnessKit / cc-connect / happy-cli
L0  协议      dreammate-network        ← 本包
```

## 2. 六个核心对象

第一版只定义这六个，**Task 是可选关联对象，不是执行链的前置条件**：

```
Node        在哪里执行
Service     节点上的一组能力聚合
Capability  能做什么
Resource    拥有什么
Execution   某一次具体发生的工作行为
Session     这一次的工作上下文
```

关系：

```
Node
 ├─ Services
 │    ├─ Capabilities
 │    └─ Resources
 │
 └─ Agent Runtime?          （Service 的一种特殊 kind）
       └─ Sessions

Execution
 ├─ node?
 ├─ service?
 ├─ session?
 └─ task?                   ← 可空，且是独立关联表
```

三条不能破的规则：

| 规则 | 破了会怎样 |
|------|-----------|
| **Node ≠ Agent** | 无 Agent 的录音硬件就进不了网络 |
| **Capability ≠ Resource** | 调度侧与检索侧路径缠在一起 |
| **Execution 不含 task_id** | 体外循环（想到了直接干）变成非法状态 |

## 3. 四个 Schema

| 文件 | 对应类型 | 用在哪 |
|------|----------|--------|
| [`schemas/node.schema.json`](../schemas/node.schema.json) | `NodeManifest` | `GET /manifest`、`POST /nodes/register` |
| [`schemas/service.schema.json`](../schemas/service.schema.json) | `Service`、`AccessDescriptor` | 嵌在 Node Manifest 内 |
| [`schemas/execution.schema.json`](../schemas/execution.schema.json) | `Execution` | `POST /executions`、`PATCH /executions/:id` |
| [`schemas/session-ref.schema.json`](../schemas/session-ref.schema.json) | `SessionRef` | 跨机 Session 引用与图的边 |

Schema 与 [`typescript/types.ts`](../typescript/types.ts) 一一对应，**改动必须同步两边**。

`TaskExecutionLink` 与 `PlanningClass` 只在 types.ts 里，没有对应 schema——
前者是 Control Plane 侧的存储关系（不在节点间传输），后者是从时间事实推导出的
分类命名（协议不存储它，也不在 L0 实现推导）。

## 4. URI 方案

```
session://<node>/<runtime>/<session_id>

session://mac/codex/01a0907c
session://iphone/yima/abc123
```

资源同理：

```
recording://tingqi-01/abc
transcript://tingqi-01/abc
speaker://tingqi-001/speaker-23
```

`session://iphone/yima/abc123` 与 `session://mac/codex/01a0907c` 是**同等级实体**，
引用关系完全对称。设备类型不影响 Session Graph。

## 5. 节点侧必须实现的接口

```
GET   /manifest                      返回 NodeManifest
GET   /health
POST  /capabilities/:name/invoke
```

外加向**本机 node agent** 报备（见 §6）。注意这里已经不是早期草案里的
`register / heartbeat / update manifest` 三件套：heartbeat 被砍了——存活由
tailnet（Node 层）加 agent 探 `/health`（Service 层）负责，push 心跳既多余
又让 L2 反过来依赖 L3。

**不要为了统一而把一切硬塞进 `/invoke`。** 特殊 Service 保留原生协议：

| Service kind | 协议 |
|--------------|------|
| `session_registry` | session-reader HTTP（`1session serve`） |
| `agent_runtime` | ACP |
| `mcp` | MCP |

Capability Manifest 只负责告诉调用方：**我有什么，以及应该怎么访问。**

## 6. 节点与服务的发现

发现分两层，各有各的事实源：

```
有哪些节点         ← tailnet（tailscale status --json）
节点是不是开着     ← tailnet 的 Online
节点上有什么服务   ← 探测约定端口的 GET /manifest
服务还活着吗       ← 定期探 GET /health
```

**方向永远是 L3 → L2（pull），不是 L2 → L3（push）。** 服务不需要知道
Control Plane 存在，也不需要心跳定时器；Control Plane 挂了，服务毫无感觉。
这与「上层通过 HTTP 调用下层」的单向依赖一致。

⚠️ **Node 在线 ≠ Service 在线。** tailnet 的 `Online` 只说明机器开着；
进程被 kill 了它照样报在线。Service 级的存活只能靠探 `/health`。

### 约定端口

pull 要知道探哪儿，所以端口是公共词汇的一部分：

| 端口 | Service | 层 |
|------|---------|-----|
| **36908** | **`node-agent`（dreammate-node）** | **本机基础设施** |
| 7777 | `session-registry`（session-reader） | L2 |
| 7778 | `data-service` | L2 |
| 7779 | `control-plane` | L3 |
| 7780 | `tingqi-adapter` 等 Resource Provider | L2 |
| 7781–7789 | 预留给后续 L2 服务 | — |

这是**默认值，不是强制**。服务可以跑在别的端口，代价是探测发现不了它，
得由它自己 `POST /nodes/register` 告知——register 因此是可选的加速/兜底，
不是必需品。

### 本机 node agent

每台机器跑一个 `@1agents/dreammate-node`，固定监听 **36908**。它是这台机器
对网络的唯一入口：

```
        Control Plane / 任意节点
                  │  探 36908（每台机器只探一个端口）
                  ▼
        node-agent :36908
         ├─ GET  /manifest      本机聚合视图：节点身份 + 所有已报备的服务
         ├─ GET  /health
         ├─ GET  /services      各服务的存活与可达性
         └─ POST /services      服务报备（**仅接受 localhost**）
                  ▲
      ┌───────────┴───────────┐  localhost 报备
 session-reader :7777    task-service :xxxx
```

这把 pull 探测的成本从「N 个节点 × M 个端口」降到「N × 1」。

**报备是可选的。** 服务不报备也能工作，只是外部得靠约定端口才找得到它。
报备时必须声明**可达性**：

| `reachability` | 含义 |
|---|---|
| `localhost` | 只监听回环，外部节点发现得了但连不上 |
| `network` | 监听 0.0.0.0 或 tailnet 地址，外部可直连 |

agent 如实转述这个声明，**不做代理**。调用方看到 `localhost` 就知道这个能力
只对本机开放，不用白跑一趟。

> ⚠️ `POST /services` 只接受来自回环的请求。否则网络上任何人都能往你的节点
> 里塞一个假服务，把调用方引到别处去。

### Control Plane 不是一个进程

node 注册与探活下沉成了每台机器的基础设施（就是上面的 agent），原本设想中
Control Plane 的其余职责——Task、Agent 编排、Execution 账本——**降级为平级的
普通服务**，各自独立起进程、各自向本机 agent 报备。

```
以前：Control Plane = Node Registry + Execution Ledger + Task + Orchestrator
                      （一个大进程）

现在：node-agent      = Node Registry + 探活        （每机一个，基础设施）
      task-service    ┐
      agent-service   ├ 平级服务，各自解耦运行，都向本机 agent 报备
      execution-*     ┘
```

好处是任何一个服务挂掉都不会让整个控制面消失，也不存在"必须先起 Control Plane
才能用"的启动顺序。代价是全网视图需要有人聚合——那也只是另一个服务，它靠
tailnet + 探 36908 自己拼出来。

### 节点身份取自 tailnet

节点的 `node_id` / `name` / `type` 应该直接用 tailnet 的事实，而不是自己生成：

| Manifest 字段 | tailscale status 的来源 |
|---|---|
| `node_id` | `Self.ID`（稳定，重启不变） |
| `name` | `Self.DNSName` 的第一段 |
| `type` | `Self.OS`（macOS→macos，iOS→ios，…） |
| `tailscale_name` | `Self.DNSName` |

> ⚠️ **不要用 `HostName`。** iOS 设备的 HostName 全是 `localhost`——实测一个
> 11 节点的 tailnet 里只有 9 个 HostName 唯一，而 DNSName 是 11/11 唯一且可读
> （`iphone-15-pro`）。用 HostName 做 `session://<node>/...` 的第一段，几台
> 手机接进来就会全部撞在 `session://localhost/...`。

本机所有服务读同一份 tailnet 状态，所以不会各自生成 id 把一台机器裂成几个 Node。
拿不到 tailscale 时可以回退到本地身份，但要在 `metadata.identity_source` 里
如实标明，因为回退身份的 `name` 不保证跨设备唯一。

### `/manifest` 永远是部分视图

一个节点上跑着多个服务时，每个服务的 `/manifest` 只报**自己**那一个 service，
但 `node_id` 是相同的。完整的节点视图（把同一 `node_id` 下的 services 合并）
只存在于 Control Plane 的 `GET /nodes/:id/manifest`。

消费方看到两份 `node_id` 相同、`services` 不同的 manifest 是**正常的**，
不是冲突。

## 7. 传输只出现在 `access` 里

数据模型里**不存在** MCP Capability / CLI Capability / HTTP Capability。
一个 Capability 可以有多种 access，调用方不关心底层是谁：

```json
{
  "id": "transcripts",
  "capabilities": ["transcript.read"],
  "access": [
    { "protocol": "mcp",  "tool": "transcript_read" },
    { "protocol": "http", "endpoint": "GET /transcripts/:id" },
    { "protocol": "cli",  "command": "tingqi transcript get" }
  ]
}
```

包装优先级 `MCP > CLI > HTTP`，但**第一版不做自动 fallback 编排**，手工声明即可。

**`access` 数组是有序的：靠前的优先，靠后的是 fallback。** 同一个 protocol
出现多次是合法且有用的：

```json
"access": [
  { "protocol": "http", "base_url": "http://scott-mac.tailfb4720.ts.net:7777/v1" },
  { "protocol": "http", "base_url": "http://100.88.227.56:7777/v1" }
]
```

MagicDNS 名放前面（可读，IP 变了也不用改 manifest），tailnet IP 兜底。
**这不是多余的**——调用方的 DNS 可能被劫持：实测一台装了 fake-ip 代理的 Mac
会把 `iclaw-6e78b1` 解析到 `198.18.1.113`，直连 `100.75.105.79` 才通。
只给 DNS 名的话，那台机器就永远连不上这个服务。

调用方按顺序试，第一个连通的就用。

`acp` 与前三者不是一回事：MCP/CLI/HTTP 面向 Capability 与 Resource，
ACP 面向 Agent Runtime 的 Session 控制（`agent.session.new` / `prompt` / `cancel` /
`status` / `resume`）。

## 8. 图的边由事件实时写入

不跑后台扫库猜 DAG。调用发生时就写边：

| 边 | 何时写 |
|----|--------|
| `Session B --references--> Session A` | B 调用 `sessions.read(A)` 时 |
| `Session O --initiates--> Execution E` | 总管创建执行时 |
| `Execution E --opens--> Session S` | Agent Session 建立时 |
| `Execution E1 --delegates--> Execution E2` | 子 Agent 派生时 |
| `Session A --produces--> Artifact` | 产出时 |
| `Execution E --accesses--> Resource R` | 访问时 |

整体 Work Graph **不是** DAG（Session 之间可以成环）；DAG 只是它的投影视图。

## 9. Execution 的粒度边界

| 层级 | 记录为 |
|------|--------|
| Session 内的低层行为（`cat README`、`grep foo`、`npm test`） | Session Event / Tool Call |
| 跨系统边界、跨调度边界 | **Execution** |

否则一个 338 次 tool call 的 Codex Session 会生成 338 个 Execution，
Work Graph 立刻失去意义。

## 10. 怎么消费本包

**TypeScript**（工作区内直接引源码，不引入构建链，从而保持真正零依赖）：

```ts
import type { NodeManifest, Execution, SessionURI } from "dreammate-network";

const manifest: NodeManifest = {
  node_id: "iphone_xxx",
  name: "Scott-iPhone",
  type: "ios",
  services: [
    { id: "reminders", capabilities: ["reminders.read", "reminders.create"] },
  ],
};
```

pnpm workspace 里加 `"dreammate-network": "workspace:*"`；其他情况用
`file:` / git 依赖。`exports` 的入口指向 `.ts` 源码，由消费方的 bundler
（vite / esbuild / tsx / webpack）处理；需要独立 JS 产物时再加 build，第一版不加。

**Go / Swift / 其他语言**：读同一份 `schemas/*.json`，手写或代码生成对应结构体。
schema 是唯一事实源，types.ts 只是它的 TS 投影。

**校验**（任意 JSON Schema draft 2020-12 校验器）：

```bash
# Node Manifest（-r 带上被 $ref 的 service schema）
npx -p ajv-cli@5 -p ajv-formats@2 ajv validate --spec=draft2020 -c ajv-formats \
  -s schemas/node.schema.json -r schemas/service.schema.json -d your-manifest.json

# Execution / SessionRef 用到 format: date-time，必须带 -c ajv-formats，
# 否则 ajv 会报 unknown format "date-time"。
npx -p ajv-cli@5 -p ajv-formats@2 ajv validate --spec=draft2020 -c ajv-formats \
  -s schemas/execution.schema.json -d your-execution.json
```

每个 schema 自带 `examples`，可以直接抽出来当冒烟用例跑。

## 11. 第一版明确不做

- ❌ 不写任何业务逻辑（本包只是公共语言）
- ❌ Capability 不带 provider / permission / availability 元数据
- ❌ 不做自动服务发现（节点手工配 `control_plane`）
- ❌ 不做 MCP→CLI→HTTP 自动 fallback 编排
- ❌ 不做 Capability 调度评分
- ❌ 不要求所有能力统一成 MCP
- ❌ 不存 `planned = true/false`（由时间事实推导）

## 12. 版本

`PROTOCOL_VERSION = "0.1.0"`。v0.x 期间 schema 可能破坏性变更，
以设计册 06-实施路线图的 M1–M5 验收结果为准收敛。

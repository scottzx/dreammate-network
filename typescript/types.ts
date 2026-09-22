/**
 * DreamMate Network — L0 协议类型
 *
 * 这是所有 repo 共享的「公共语言」，零依赖、不含任何业务逻辑。
 * 每一个类型都与 ../schemas/*.json 一一对应，改动必须同步两边。
 *
 * 依赖规则（强制单向）：任何层都可以 import 本包，本包不 import 任何人。
 *
 * @packageDocumentation
 */

/**
 * 协议版本，与本包的 package.json 版本保持一致——两个版本号会让人永远猜不准
 * 该看哪个。服务在 `manifest.metadata.protocol_version` 里报告它遵循的版本。
 */
export const PROTOCOL_VERSION = "0.5.0";

/* ------------------------------------------------------------------ *
 * URI
 * ------------------------------------------------------------------ */

/** `session://<node>/<runtime>/<session_id>` */
export type SessionURI = `session://${string}/${string}/${string}`;

/** 资源寻址，如 `recording://tingqi-01/abc`、`speaker://tingqi-001/speaker-23` */
export type ResourceURI = `${string}://${string}`;

/* ------------------------------------------------------------------ *
 * Capability / Resource
 *
 * Capability = 能做什么；Resource = 拥有什么。两者不要混：
 * 检索侧走 resource.search / resource.read，调度侧走 capability.invoke。
 * ------------------------------------------------------------------ */

/**
 * 点分命名的能力标识，如 `sessions.read`、`reminders.create`、`recordings.list`。
 *
 * 第一版刻意就是一个字符串——不带 provider / permission / availability 等元数据。
 * 那些留到真的要做 capability 调度时再说。
 */
export type Capability = string;

/** Service 拥有的资源类别（声明 scheme，而不是逐条枚举资源）。 */
export interface ResourceDescriptor {
  scheme: string;
  description?: string | null;
}

/* ------------------------------------------------------------------ *
 * 传输
 *
 * 传输是「怎么访问」，不是「它是什么」。数据模型里不存在
 * MCP Capability / CLI Capability / HTTP Capability 这种东西。
 * ------------------------------------------------------------------ */

/**
 * `mcp` / `cli` / `http` 面向 Capability 与 Resource；
 * `acp` 面向 Agent Runtime 的 Session 控制，与前三者不是一回事。
 */
export type Protocol = "mcp" | "http" | "cli" | "acp";

/**
 * 同一组能力可以同时有多种 access，调用方不必关心底层是谁。
 * 包装优先级 MCP > CLI > HTTP，但第一版不做自动 fallback 编排，手工声明即可。
 *
 * **数组是有序的：靠前的优先，靠后的是 fallback。** 同一个 protocol 出现多次
 * 是合法且有用的——比如 HTTP 先给 MagicDNS 名（可读、IP 变了也不用改），
 * 再给 tailnet IP 兜底：调用方的 DNS 可能被代理软件劫持（实测一台装了
 * fake-ip 代理的 Mac 会把 MagicDNS 名解析到 198.18.x.x），那时只有 IP 能用。
 */
export interface AccessDescriptor {
  protocol: Protocol;
  /** protocol=http：服务基址，如 `http://scott-mac:7777/v1` */
  base_url?: string;
  /** protocol=http：单个 capability 的相对路由，如 `GET /transcripts/:id` */
  endpoint?: string;
  /** protocol=mcp：对应的 tool 名 */
  tool?: string;
  /** protocol=mcp：MCP server 标识 */
  server?: string;
  /** protocol=cli：命令，如 `tingqi transcript get` */
  command?: string;
}

/* ------------------------------------------------------------------ *
 * 发现
 * ------------------------------------------------------------------ */

/**
 * 约定端口。发现是 pull 的（Control Plane 探测节点的 `/manifest` 与
 * `/health`），所以「哪个服务在哪个端口」必须是公共词汇，否则探测方无从下手。
 *
 * 这是**默认值，不是强制**：服务可以跑在别的端口，代价是探测发现不了它，
 * 得由它自己 `POST /nodes/register` 告知。
 *
 * 与 docs/protocol.md §6 的表格一一对应，改动必须同步两边。
 */
export const DEFAULT_PORTS = {
  /**
   * 本机 node agent（`@1agents/dreammate-node`）。**固定端口**，不可改：
   * 它是整台机器对网络的唯一入口，外部节点靠"探 36908"找到这台机器上的一切。
   */
  "node-agent": 36908,
  "session-registry": 7777,
  "data-service": 7778,
  "control-plane": 7779,
  "tingqi-adapter": 7780,
} as const;

export type WellKnownService = keyof typeof DEFAULT_PORTS;

/**
 * 节点身份是从哪来的。
 *
 * `tailscale` 表示取自 tailnet（`Self.ID` / `DNSName` / `OS`），此时 `name`
 * 跨设备唯一。`local` 是回退，`name` **不保证唯一**——iOS 的 hostname 全是
 * `localhost`——只适合单机自用。放进 `metadata.identity_source` 如实告诉对端。
 */
export type IdentitySource = "tailscale" | "local";

/* ------------------------------------------------------------------ *
 * Node / Service
 * ------------------------------------------------------------------ */

/**
 * 非 generic 的几种在传输层保留原生协议，不强行塞进
 * `POST /capabilities/:name/invoke`。
 */
export type ServiceKind =
  | "generic"
  | "agent_runtime"
  | "session_registry"
  | "resource_provider"
  | "mcp";

/**
 * Node 上的一组能力聚合。
 *
 * 三层结构是 Node → Service → Capability / Resource，
 * 不要把 Capability 扁平铺到 Node 上。
 */
/** 这个 Service 能被谁连上。省略时按 `network` 理解。 */
export type Reachability = "localhost" | "network";

/**
 * 方法契约描述：定义供大模型与 RPC 调用的方法接口。
 */
export interface MethodDescriptor {
  /** 方法的业务功能描述，供智能体理解意图。 */
  description: string;
  /**
   * 入参 JSON Schema（必须为 object 结构）。
   * 包含 properties、required 等标准 JSON Schema 字段。
   */
  parameters?: {
    type?: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  } | Record<string, unknown>;
  /** 返回值结构说明。 */
  returns?: Record<string, unknown>;
}

/**
 * 技能 SOP 指南描述：提供大模型在复杂任务下的多步编排与避坑指南。
 */
export interface SkillDescriptor {
  /** 技能唯一标识名。 */
  name: string;
  /** 技能触发场景描述。 */
  description: string;
  /** Markdown 格式的完整 SOP 操作指南。 */
  sop: string;
  /** 是否具备可跨节点打包下载的本地技能包。 */
  has_package?: boolean;
  metadata?: Record<string, unknown>;
}

/** 服务调用方式：cli=仅命令行；http=仅常驻HTTP；hybrid=双模兼容，优先CLI。 */
export type ExecutionMode = "cli" | "http" | "hybrid";

/** 服务启停生命周期规范，声明能否被网关按需拉起或关闭。 */
export interface ServiceLifecycle {
  /** 如何拉起该服务的常驻进程（如 'transcribe serve --port 7782'）。 */
  start_command?: string;
  /** 如何通过 HTTP 关闭该服务（如 '/shutdown'）。 */
  stop_endpoint?: string;
  /** 是否支持被 node agent 自动拉起。 */
  can_spawn?: boolean;
  /** 是否支持被 node agent 请求关闭。 */
  can_shutdown?: boolean;
}

export interface Service {
  id: string;
  name?: string | null;
  /** 省略等同于 `"generic"` */
  kind?: ServiceKind;
  /** 服务调用模式：cli | http | hybrid（默认 hybrid）。 */
  execution?: ExecutionMode;
  /** 执行指令或可执行文件名称（如 'transcribe'）。 */
  command?: string;
  /** 服务的启停生命周期控制参数。 */
  lifecycle?: ServiceLifecycle;
  /**
   * @deprecated 历史遗留字段，新服务请直接使用 `methods` 与 `skills`。
   */
  capabilities?: Capability[];
  /** 可供调用的机器方法契约集合。 */
  methods?: Record<string, MethodDescriptor>;
  /** 配套的领域业务 SOP 与技能指南。 */
  skills?: Record<string, SkillDescriptor>;
  resources?: ResourceDescriptor[];
  access?: AccessDescriptor[];
  /**
   * 服务自己怎么监听。`localhost` = 只绑回环，外部不能直连其端口；
   * `network` = 可被外部直连。node agent 在 manifest 里如实转述。
   * 跨节点调用走 agent 的统一入口（`POST /services/:id/invoke` 或
   * MCP `dreammate_invoke`），由本机 agent 转发到回环 HTTP 或 CLI。
   */
  reachability?: Reachability;
  /** 实际监听端口。纯 CLI 模式可省略。不必等于 {@link DEFAULT_PORTS} 里的默认值。 */
  port?: number | null;
  /** 存活探测路径，默认 `/health`。 */
  health?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * 节点形态。故意保留 `(string & {})` 开放口——任何硬件都应该能进入同一张网络。
 */
export type NodeType =
  | "macos"
  | "ios"
  | "linux"
  | "windows"
  | "recorder"
  | "gpu"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * 由节点侧 `GET /manifest` 返回，并通过 `POST /nodes/register` 上报给 Control Plane。
 *
 * **Node ≠ Agent。** Node = 一个可以在网络中被发现、声明资源和能力、
 * 接受读取或操作请求的实体。Agent Runtime 只是它可以承载的一种 Service。
 */
export interface NodeManifest {
  node_id: string;
  name: string;
  type: NodeType;
  /** tailnet 内的寻址名。第一版所有节点通过 Tailscale 统一寻址。 */
  tailscale_name?: string | null;
  /** 由 Control Plane 依据 heartbeat 维护；节点自报时可省略。 */
  online?: boolean;
  /** 可以为空数组——还没声明任何能力的节点仍然是合法节点。 */
  services: Service[];
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Execution
 * ------------------------------------------------------------------ */

/** 不是只有 Agent 才产生 Execution。 */
export type ExecutionType =
  /** 有 Node / Runtime / Session */
  | "agent_execution"
  /** 有 Node / Service / Capability，无 Session */
  | "capability_invocation"
  /** 设备侧任务 */
  | "device_job"
  /** 读取远端资源，无 Agent */
  | "resource_access"
  /** 人在现实中的动作 */
  | "human_action";

/**
 * `waiting_for_user` 是接入手机后必须新增的一类状态：请求用户在现实世界
 * 做某个动作（确认日程、选联系人、授权 iOS 权限）。有了它，总管才能直接
 * 回答「3 个任务正在执行，1 个等待你确认」。
 */
export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed";

/**
 * 现实中实际发生的一次工作行为。
 *
 * 两条硬规则：
 *
 * 1. **这里没有 `task_id`。** Task 关联是独立的 many-to-many link
 *    （见 {@link TaskExecutionLink}），绝不允许 `executions.task_id NOT NULL`。
 * 2. **大量字段可空是刻意的**，一个 `capability_invocation` 既没有 session
 *    也没有 runtime。
 *
 * 粒度边界：跨系统 / 跨调度边界才升级为 Execution；Session 内的低层 tool call
 * （`cat README`、`npm test`）记为 Session Event。否则一个 338 次 tool call 的
 * Codex Session 会生成 338 个 Execution，Work Graph 立刻失去意义。
 */
export interface Execution {
  id: string;
  type: ExecutionType;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  status: ExecutionStatus;

  /** status=waiting_for_user 时向用户描述需要他做什么。 */
  requires_user_action?: string | null;

  /** 发起方 Session（通常是总管）。写入时产生 Session --initiates--> Execution。 */
  initiated_by_session_id?: string | null;

  /** 在哪里执行 */
  node_id?: string | null;
  /** 用了该 Node 上的哪个 Service */
  service_id?: string | null;
  /** 调用了哪个 Capability */
  capability?: Capability | null;
  /** 用什么 Agent harness 执行 */
  agent_runtime?: string | null;
  /** 这次推理用谁 */
  model?: string | null;
  /** 仅 agent_execution 才有。写入时产生 Execution --opens--> Session。 */
  session_id?: string | SessionURI | null;
  /** type=resource_access 时访问的资源。写入时产生 Execution --accesses--> Resource。 */
  resource_uri?: ResourceURI | null;
  /** 子 Agent 派生时写入，形成 Execution --delegates--> Execution。 */
  parent_execution_id?: string | null;

  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Session Reference
 * ------------------------------------------------------------------ */

/**
 * 所有边由调用事件实时写入（B 调用 `sessions.read(A)` 时就写
 * `B --references--> A`），不靠后台扫库猜 DAG。
 *
 * 注意整体 Work Graph **不是** DAG：Session 之间完全可以成环，
 * DAG 只是它的某些投影视图（任务分解树、委派树、Agent spawn 树）。
 */
export type EdgeRelation =
  | "references"
  | "opens"
  | "initiates"
  | "delegates"
  | "produces"
  | "accesses";

/**
 * 跨节点引用一个 Session。设备类型不影响 Session Graph——
 * `session://iphone/yima/abc123` 与 `session://mac/codex/01a0907c`
 * 是同等级实体，引用关系完全对称。
 */
export interface SessionRef {
  uri: SessionURI;
  /** 冗余字段，便于消费方免解析。 */
  node?: string;
  runtime?: string;
  session_id?: string;
  relation?: EdgeRelation;
  /** 这条边被观察到的时刻。底层只保存事实，不提前做价值判断。 */
  observed_at?: string | null;
}

/* ------------------------------------------------------------------ *
 * Task 关联（Control Plane 侧存储关系，不是节点间传输对象）
 * ------------------------------------------------------------------ */

/**
 * Task 与 Execution 的关系是 `0..N ←→ 0..N`：
 *
 * - Task 可以没有 Execution：计划了还没做
 * - Execution 可以没有 Task：直接干了没计划（体外循环，一等公民）
 * - 一个 Task 多个 Execution：Codex 第一轮 → Claude 接力 → Codex review
 * - 一个 Execution 同时推进多个 Task
 *
 * 所以必须是独立关联表，**绝不要**把 task_id 塞进 executions。
 */
export interface TaskExecutionLink {
  task_id: string;
  execution_id: string;
  linked_at: string;
  relation?: string;
}

/**
 * 计划状态**不存字段**，由四个时间事实推导：
 * `task_created_at` / `execution_started_at` / `execution_finished_at` /
 * `task_execution_link_created_at`。
 *
 * 这里只给分类命名，协议本身不存储它，也不在 L0 实现推导逻辑——
 * 底层只保存事实，不提前做价值判断。
 */
export type PlanningClass =
  /** 计划后执行：link 在 execution 开始前 */
  | "planned"
  /** 执行中纳入：link 在 start 与 finish 之间 */
  | "in_flight_captured"
  /** 事后归档：link 在 finish 之后 */
  | "retrospective"
  /** 完全体外：没有任何 task edge */
  | "out_of_plan";

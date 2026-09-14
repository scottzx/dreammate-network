/**
 * L0 协议自检。零依赖（只用 node:test），跑得快，钉住两类真实风险：
 *
 *   1. schema 与 typescript/types.ts 漂移 —— protocol.md 要求两边同步，靠人记不住；
 *   2. 三条硬规则被无意破坏 —— 比如有人"顺手"把 task_id 加回 Execution。
 *
 * 完整的 JSON Schema 校验交给消费方（命令见 docs/protocol.md §9），这里不引 ajv。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readSchema = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, 'schemas', `${name}.schema.json`), 'utf8'));
const types = fs.readFileSync(path.join(root, 'typescript', 'types.ts'), 'utf8');

const NAMES = ['node', 'service', 'execution', 'session-ref'];

test('每个 schema 都是合法 JSON，且自带身份与示例', () => {
  for (const name of NAMES) {
    const schema = readSchema(name);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', name);
    assert.equal(schema.$id, `https://dreammate.work/schemas/${name}.schema.json`, name);
    assert.ok(schema.title, `${name} 缺 title`);
    assert.ok(schema.description, `${name} 缺 description`);
    // 示例既是文档也是冒烟用例，不允许为空。
    assert.ok(Array.isArray(schema.examples) && schema.examples.length > 0, `${name} 缺 examples`);
  }
});

test('每个 example 都带齐自己 schema 的必填字段', () => {
  for (const name of NAMES) {
    const schema = readSchema(name);
    for (const [i, example] of schema.examples.entries()) {
      for (const key of schema.required ?? []) {
        assert.ok(key in example, `${name} example[${i}] 缺必填字段 ${key}`);
      }
    }
  }
});

test('硬规则一：Execution 不含 task_id', () => {
  const execution = readSchema('execution');
  assert.ok(
    !('task_id' in execution.properties),
    'Task 关联必须是独立的 many-to-many link，绝不能塞回 Execution',
  );
  assert.ok(!(execution.required ?? []).includes('task_id'));
  // types.ts 那一侧同样不许有。
  const body = types.slice(types.indexOf('export interface Execution'));
  assert.ok(!/^\s+task_id/m.test(body.slice(0, body.indexOf('\n}'))), 'types.ts 的 Execution 出现了 task_id');
});

test('硬规则二：传输只出现在 access 里，不进 capability 名', () => {
  const service = readSchema('service');
  const protocols = service.$defs.access.properties.protocol.enum;
  assert.deepEqual(protocols, ['mcp', 'http', 'cli', 'acp']);
  for (const name of NAMES) {
    for (const example of readSchema(name).examples) {
      const capabilities = (example.services ?? [example]).flatMap((s) => s.capabilities ?? []);
      for (const capability of capabilities) {
        assert.ok(
          !/^(mcp|http|cli|acp)[._]/i.test(capability),
          `capability "${capability}" 把传输方式写进了名字`,
        );
      }
    }
  }
});

test('硬规则三：Node 不以 Agent 为前提，services 可以为空', () => {
  const node = readSchema('node');
  assert.ok(!node.required.includes('agent_runtime'));
  assert.equal(node.properties.services.type, 'array');
  assert.ok(node.properties.services.minItems === undefined, 'services 不许有下限：无 Agent 的节点也是一等节点');
});

test('schema 与 types.ts 的枚举保持同步', () => {
  const pairs = [
    [readSchema('execution').properties.type.enum, /export type ExecutionType =([\s\S]*?);/],
    [readSchema('execution').properties.status.enum, /export type ExecutionStatus =([\s\S]*?);/],
    [readSchema('service').properties.kind.enum, /export type ServiceKind =([\s\S]*?);/],
    [readSchema('session-ref').properties.relation.enum, /export type EdgeRelation =([\s\S]*?);/],
    [readSchema('service').$defs.access.properties.protocol.enum, /export type Protocol =([\s\S]*?);/],
  ];
  for (const [values, pattern] of pairs) {
    const declared = types.match(pattern)?.[1] ?? '';
    const found = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      [...values].sort(),
      [...found].sort(),
      `schema 与 types.ts 不一致：${values.join(',')} vs ${found.join(',')}`,
    );
  }
});

test('Node Manifest 的必填字段与 types.ts 一致', () => {
  const required = readSchema('node').required;
  const body = types.slice(types.indexOf('export interface NodeManifest'));
  const block = body.slice(0, body.indexOf('\n}'));
  for (const key of required) {
    // 必填字段在 TS 里不能带 `?`。
    assert.ok(new RegExp(`^\\s+${key}:`, 'm').test(block), `types.ts 的 NodeManifest 把必填字段 ${key} 写成了可选`);
  }
});

test('SessionURI 的形状 schema 与 types.ts 说的是同一件事', () => {
  const pattern = readSchema('session-ref').properties.uri.pattern;
  assert.equal(pattern, '^session://[^/]+/[^/]+/.+$');
  assert.match(types, /type SessionURI = `session:\/\/\$\{string\}\/\$\{string\}\/\$\{string\}`/);
  const re = new RegExp(pattern);
  assert.ok(re.test('session://mac/codex/01a0907c'));
  assert.ok(re.test('session://iphone/yima/abc123'));
  assert.ok(!re.test('session://mac/codex'), '三段缺一不可');
  assert.ok(!re.test('recording://tingqi-01/abc'));
});

test('DEFAULT_PORTS 与 protocol.md 的端口表一致', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'protocol.md'), 'utf8');
  const declared = [...types.matchAll(/"([a-z-]+)":\s*(\d{4,5}),/g)].map((m) => [m[1], Number(m[2])]);
  assert.ok(declared.length >= 5, 'types.ts 里没找到端口表');
  assert.ok(declared.some(([s]) => s === 'node-agent'), 'node-agent 必须在表里');
  for (const [service, port] of declared) {
    // 文档表格里必须有同一行，否则两边就漂了。
    const row = new RegExp(`\\|\\s*\\*{0,2}${port}\\*{0,2}\\s*\\|[^|]*\`${service}\``);
    assert.match(doc, row, `protocol.md 缺 ${service}=${port} 这一行`);
  }
});

test('约定端口互不冲突', () => {
  const ports = [...types.matchAll(/"[a-z-]+":\s*(\d{4,5}),/g)].map((m) => Number(m[1]));
  assert.equal(new Set(ports).size, ports.length, '两个服务抢同一个端口');
});

test('reachability 是协议词汇，schema 与 types.ts 不许漂', () => {
  const values = readSchema('service').properties.reachability.enum;
  assert.deepEqual(values, ['localhost', 'network']);
  const declared = types.match(/export type Reachability =([\s\S]*?);/)?.[1] ?? '';
  const found = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...values].sort(), [...found].sort());
});

test('node-agent 的端口是固定的 36908', () => {
  // 它是整台机器对网络的唯一入口，外部节点靠"探 36908"找到这台机器上的一切。
  // 改这个数字等于让全网的探测方同时失明，所以单独钉一道。
  assert.match(types, /"node-agent":\s*36908,/);
  const doc = fs.readFileSync(path.join(root, 'docs', 'protocol.md'), 'utf8');
  assert.match(doc, /36908/);
});

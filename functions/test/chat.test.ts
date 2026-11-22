import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ChatRelay, MemoryChatStore, chatSystemPrompt, setupAssistant } from '../src/assistant';
import { MemoryBridgeStore } from '../src/bridge';
import { MemoryScheduleStore } from '../src/store';
import { buildServer } from '../src/tools';

type Ev = { id: string; type: string; [k: string]: unknown };

/** A stand-in for the Managed Agents API: each turn replays a scripted list of events. */
function fakeClient(turns: Ev[][]) {
  const calls: { method: string; args: unknown[] }[] = [];
  let turn = 0;
  const history: Ev[] = [];
  const nextTurn = () => {
    const evs = turns[turn++] ?? [];
    history.push(...evs);
    return evs;
  };
  const iter = (evs: Ev[]) => ({
    async *[Symbol.asyncIterator]() {
      for (const e of evs) yield e;
    },
  });
  let pending: Ev[] = [];
  const client = {
    beta: {
      environments: { create: async (p: unknown) => (calls.push({ method: 'environments.create', args: [p] }), { id: 'env_1' }) },
      agents: {
        create: async (p: unknown) => (calls.push({ method: 'agents.create', args: [p] }), { id: 'agent_1', version: 1 }),
        update: async (id: string, p: unknown) => (calls.push({ method: 'agents.update', args: [id, p] }), { id, version: 2 }),
      },
      vaults: {
        create: async (p: unknown) => (calls.push({ method: 'vaults.create', args: [p] }), { id: 'vlt_1' }),
        credentials: { create: async (id: string, p: unknown) => (calls.push({ method: 'credentials.create', args: [id, p] }), { id: 'cred_1' }) },
      },
      sessions: {
        create: async (p: unknown) => {
          calls.push({ method: 'sessions.create', args: [p] });
          // initial_events start the turn right away; the first events land before the stream opens
          pending = nextTurn();
          return { id: 'sesn_1', status: 'running' };
        },
        events: {
          // history of this session (used to catch up after create)
          list: (_id: string) => iter(pending.slice(0, 1)),
          stream: async (_id: string) => {
            calls.push({ method: 'events.stream', args: [_id] });
            const evs = pending.length ? pending : null;
            pending = [];
            return evs ? iter(evs) : { async *[Symbol.asyncIterator]() { for (const e of nextTurn()) yield e; } };
          },
          send: async (id: string, p: unknown) => {
            calls.push({ method: 'events.send', args: [id, p] });
            return {};
          },
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls, history };
}

const ids = () => {
  let n = 0;
  return (p: string) => `${p}${++n}`;
};
const CLOCK = () => new Date('2026-11-21T18:05:00Z'); // 1:05 PM in New York

describe('setupAssistant', () => {
  it('creates the environment, agent (Trinity’s tools, web search, persona) and a vault credential, then updates in place', async () => {
    const chat = new MemoryChatStore();
    const { client, calls } = fakeClient([]);
    const deps = { client, chat, issueAgentToken: async () => 'tat_secret', getTz: async () => 'America/New_York', newId: ids() };
    const rec = await setupAssistant(deps, 'u1', 'https://trinity-x.web.app/');
    expect(rec).toMatchObject({ environmentId: 'env_1', agentId: 'agent_1', agentVersion: 1, vaultId: 'vlt_1', mcpUrl: 'https://trinity-x.web.app/mcp' });
    const agent = calls.find((c) => c.method === 'agents.create')!.args[0] as { model: string; system: string; mcp_servers: { url: string }[]; tools: { type: string; configs?: { name: string; permission_policy?: { type: string } }[] }[] };
    expect(agent.model).toBe('claude-opus-5-5');
    expect(agent.system).toContain('You are Trinity');
    expect(agent.system).toContain("## Talking in Trinity's chat");
    expect(agent.system).not.toContain('About me (fill this in)');
    expect(agent.mcp_servers[0].url).toBe('https://trinity-x.web.app/mcp');
    const mcp = agent.tools.find((t) => t.type === 'mcp_toolset')!;
    expect(mcp.configs!.find((c) => c.name === 'get_schedule')!.permission_policy!.type).toBe('always_allow');
    const cred = calls.find((c) => c.method === 'credentials.create')!.args[1] as { auth: { type: string; token: string; mcp_server_url: string } };
    expect(cred.auth).toEqual({ type: 'static_bearer', token: 'tat_secret', mcp_server_url: 'https://trinity-x.web.app/mcp' });

    // running it again changes nothing; a newer persona updates the same agent
    expect((await setupAssistant(deps, 'u1', 'https://trinity-x.web.app')).agentVersion).toBe(1);
    await chat.putAssistant('u1', { ...rec, personaVersion: 'old' });
    const updated = await setupAssistant(deps, 'u1', 'https://trinity-x.web.app');
    expect(updated.agentVersion).toBe(2);
    expect(calls.filter((c) => c.method === 'agents.create')).toHaveLength(1);
  });

  it('builds a system prompt that keeps voice replies short', () => {
    expect(chatSystemPrompt()).toContain('One to three short sentences');
  });
});

describe('ChatRelay', () => {
  const setup = async (turns: Ev[][]) => {
    const chat = new MemoryChatStore();
    await chat.putAssistant('u1', { environmentId: 'env_1', agentId: 'agent_1', agentVersion: 1, vaultId: 'vlt_1', mcpUrl: 'https://x/mcp', personaVersion: '3', createdAt: 0, updatedAt: 0 });
    const fake = fakeClient(turns);
    const relay = new ChatRelay({ client: fake.client, chat, issueAgentToken: async () => '', getTz: async () => 'America/New_York', newId: ids(), clock: CLOCK });
    return { chat, relay, ...fake };
  };

  it('starts a session with context, shows tool activity, and writes the reply', async () => {
    const { chat, relay, calls } = await setup([
      [
        { id: 'e1', type: 'session.status_running' },
        { id: 'e2', type: 'agent.mcp_tool_use', name: 'get_schedule', evaluated_permission: 'allow', input: {} },
        { id: 'e3', type: 'agent.message', content: [{ type: 'text', text: 'You have the gym at 4.' }] },
        { id: 'e4', type: 'agent.message', content: [{ type: 'text', text: 'Want me to move it?' }] },
        { id: 'e5', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
      ],
    ]);
    const r = await relay.send('u1', { conversationId: 'cvX', text: 'What’s left today?' });
    expect(r).toEqual({ conversationId: 'cvX', messageId: 'm2', status: 'done' });
    const create = calls.find((c) => c.method === 'sessions.create')!.args[0] as { agent: string; vault_ids: string[]; budget: unknown; initial_events: { content: { text: string }[] }[] };
    expect(create.agent).toBe('agent_1');
    expect(create.vault_ids).toEqual(['vlt_1']);
    expect(create.budget).toEqual({ type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } });
    expect(create.initial_events[0].content[0].text).toBe('[Saturday, November 21, 1:05 PM (America/New_York)]\nWhat’s left today?');
    const msgs = chat.messages.get('u1/cvX')!;
    expect(msgs.map((m) => [m.role, m.text, m.status])).toEqual([
      ['me', 'What’s left today?', 'done'],
      ['trinity', 'You have the gym at 4. Want me to move it?', 'done'],
    ]);
    expect((await chat.getConversation('u1', 'cvX'))!.sessionId).toBe('sesn_1');
  });

  it('continues an existing session, and pauses for a yes/no before a risky change', async () => {
    const { chat, relay, calls } = await setup([
      [{ id: 'a1', type: 'agent.message', content: [{ type: 'text', text: 'Sure.' }] }, { id: 'a2', type: 'session.status_idle', stop_reason: { type: 'end_turn' } }],
      [
        { id: 'b1', type: 'agent.message', content: [{ type: 'text', text: 'Okay, removing the gym block.' }] },
        { id: 'b2', type: 'agent.mcp_tool_use', name: 'delete_block', evaluated_permission: 'ask', input: { id: 'blk1' } },
        { id: 'b3', type: 'session.status_idle', stop_reason: { type: 'requires_action', event_ids: ['b2'] } },
      ],
      [
        { id: 'c1', type: 'agent.message', content: [{ type: 'text', text: 'Done.' }] },
        { id: 'c2', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
      ],
    ]);
    await relay.send('u1', { conversationId: 'cv1', text: 'hi' });
    const r = await relay.send('u1', { conversationId: 'cv1', text: 'Skip the gym today' });
    expect(r.status).toBe('waiting');
    expect(calls.filter((c) => c.method === 'sessions.create')).toHaveLength(1);
    const sent = calls.filter((c) => c.method === 'events.send').at(-1)!.args[1] as { events: { type: string; content: { text: string }[] }[] };
    expect(sent.events[0].content[0].text).toContain('Skip the gym today');
    const waiting = chat.messages.get('u1/cv1')!.at(-1)!;
    expect(waiting).toMatchObject({ status: 'waiting', confirm: { eventId: 'b2', tool: 'delete_block', summary: 'Remove a block from your calendar (id: blk1)' } });

    const done = await relay.confirm('u1', { conversationId: 'cv1', messageId: waiting.id, eventId: 'b2', allow: true });
    expect(done.status).toBe('done');
    const confirmEvent = calls.filter((c) => c.method === 'events.send').at(-1)!.args[1] as { events: unknown[] };
    expect(confirmEvent.events[0]).toEqual({ type: 'user.tool_confirmation', tool_use_id: 'b2', result: 'allow' });
    expect(chat.messages.get('u1/cv1')!.at(-1)).toMatchObject({ text: 'Okay, removing the gym block. Done.', status: 'done', confirm: null });
  });

  it('reminds the model of the check-in it opened with', async () => {
    const { chat, relay, calls } = await setup([[{ id: 'x', type: 'session.status_idle', stop_reason: { type: 'end_turn' } }]]);
    await chat.putConversation('u1', { id: 'ci1', kind: 'checkin', title: 'Check-in', sessionId: null, opener: 'Gym just wrapped. How did it go?', createdAt: 0, updatedAt: 0 });
    await relay.send('u1', { conversationId: 'ci1', text: 'Crushed it' });
    const create = calls.find((c) => c.method === 'sessions.create')!.args[0] as { initial_events: { content: { text: string }[] }[] };
    expect(create.initial_events[0].content[0].text).toContain('[You started this check-in by messaging me: "Gym just wrapped. How did it go?"]\nCrushed it');
  });

  it('refuses when the chat isn’t set up', async () => {
    const relay = new ChatRelay({ client: fakeClient([]).client, chat: new MemoryChatStore(), issueAgentToken: async () => '', getTz: async () => 'UTC', newId: ids() });
    await expect(relay.send('u1', { text: 'hi' })).rejects.toThrow('assistant_not_set_up');
  });
});

describe('Obsidian tools', () => {
  async function connect(bridge: MemoryBridgeStore) {
    const server = buildServer({ store: new MemoryScheduleStore({ u1: { tz: 'America/New_York' } }), uid: 'u1', bridge });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(a), client.connect(b)]);
    return async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
      return { text: r.content.map((c) => c.text).join('\n'), isError: !!r.isError };
    };
  }

  it('says so when the Mac was never connected', async () => {
    const call = await connect(new MemoryBridgeStore());
    const r = await call('vault_search', { query: 'goals' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Obsidian isn’t connected yet');
  });

  it('runs reads on the Mac and returns its answer', async () => {
    const bridge = new MemoryBridgeStore();
    bridge.info.set('u1', { lastSeen: Date.now(), vaultName: 'Life' });
    const call = await connect(bridge);
    // pretend to be the Mac: finish the job shortly after it's queued
    setTimeout(() => bridge.finish('u1', 'j1', 'Projects/Album.md: “finish the mix by March”'), 50);
    const r = await call('vault_search', { query: 'album' });
    expect(r.text).toBe('Projects/Album.md: “finish the mix by March”');
    expect(bridge.jobs.get('u1/j1')).toMatchObject({ op: 'search', args: { query: 'album', limit: 8 } });
  });

  it('queues writes while the Mac is asleep', async () => {
    const bridge = new MemoryBridgeStore();
    bridge.info.set('u1', { lastSeen: Date.now() - 60 * 60 * 1000 });
    const call = await connect(bridge);
    const r = await call('vault_append', { text: '- Slept 6h' });
    expect(r.text).toContain('queued');
    expect(bridge.jobs.get('u1/j1')).toMatchObject({ op: 'append', status: 'pending', args: { text: '- Slept 6h', heading: 'Trinity' } });
  });
});

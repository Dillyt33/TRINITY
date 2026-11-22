import type Anthropic from '@anthropic-ai/sdk';
import { longDate, clockAp } from '../../src/lib/time';
import { personaText } from './writer';
import { nowIn } from './zone';

/**
 * Trinity's own chat runs on Claude Managed Agents: Anthropic hosts the agent loop, and Trinity's
 * tools (calendar, life log, Obsidian) come from this server's MCP endpoint, authorized with a
 * long-lived token kept in an Anthropic vault. Replies are written to Firestore as they arrive,
 * so the app shows them live.
 */

export interface AssistantRecord {
  environmentId: string;
  agentId: string;
  agentVersion: number;
  vaultId: string;
  mcpUrl: string;
  personaVersion: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  kind: 'chat' | 'checkin';
  title: string;
  sessionId: string | null;
  opener?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'trinity' | 'me';
  text: string;
  at: number;
  status: 'streaming' | 'done' | 'waiting' | 'error';
  activity?: string | null;
  confirm?: { eventId: string; tool: string; summary: string } | null;
}

export interface ChatStore {
  getAssistant(uid: string): Promise<AssistantRecord | null>;
  putAssistant(uid: string, r: AssistantRecord): Promise<void>;
  getConversation(uid: string, id: string): Promise<Conversation | null>;
  putConversation(uid: string, c: Conversation): Promise<void>;
  putMessage(uid: string, conversationId: string, m: ChatMessage): Promise<void>;
  patchMessage(uid: string, conversationId: string, id: string, patch: Partial<ChatMessage>): Promise<void>;
  getMessage(uid: string, conversationId: string, id: string): Promise<ChatMessage | null>;
}

export class MemoryChatStore implements ChatStore {
  assistants = new Map<string, AssistantRecord>();
  conversations = new Map<string, Conversation>();
  messages = new Map<string, ChatMessage[]>();
  async getAssistant(uid: string) {
    return this.assistants.get(uid) ?? null;
  }
  async putAssistant(uid: string, r: AssistantRecord) {
    this.assistants.set(uid, r);
  }
  async getConversation(uid: string, id: string) {
    return this.conversations.get(`${uid}/${id}`) ?? null;
  }
  async putConversation(uid: string, c: Conversation) {
    this.conversations.set(`${uid}/${c.id}`, { ...c });
  }
  async putMessage(uid: string, conversationId: string, m: ChatMessage) {
    const k = `${uid}/${conversationId}`;
    this.messages.set(k, [...(this.messages.get(k) ?? []).filter((x) => x.id !== m.id), { ...m }]);
  }
  async patchMessage(uid: string, conversationId: string, id: string, patch: Partial<ChatMessage>) {
    const list = this.messages.get(`${uid}/${conversationId}`) ?? [];
    const m = list.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  }
  async getMessage(uid: string, conversationId: string, id: string) {
    return (this.messages.get(`${uid}/${conversationId}`) ?? []).find((x) => x.id === id) ?? null;
  }
}

/** Read-only tools run without asking; changes go through the server's per-call safety check ("auto"). */
const READ_TOOLS = ['get_schedule', 'find_free_time', 'get_about_me', 'get_life_log', 'vault_search', 'vault_read', 'vault_list', 'vault_recent'];
export const PERSONA_VERSION = '3';

const CHAT_STYLE = `

## Talking in Trinity's chat
This conversation happens in Trinity's own chat, often out loud: your replies may be read aloud in a female voice and I may be speaking to you.
- Sound like a real person who knows me well: warm, direct, natural. One to three short sentences. No markdown, lists, headings or emoji.
- Ask one question at a time. If this conversation started from a check-in you sent, pick up from it naturally.
- Use your tools quietly. Don't announce that you're checking things; just do it and answer.
- Log what I tell you about sleep, food, exercise, mood, study, projects, money, health or mental health with log_life, and write anything worth keeping into today's Obsidian daily note with vault_append when it helps.`;

export function chatSystemPrompt(): string {
  return personaText('') + CHAT_STYLE;
}

export interface AssistantDeps {
  client: Anthropic;
  chat: ChatStore;
  /** Creates the long-lived token the agent uses to call this server's MCP endpoint. */
  issueAgentToken: (uid: string) => Promise<string>;
  getTz: (uid: string) => Promise<string>;
  newId: (prefix: string) => string;
  clock?: () => Date;
}

/** Creates (or updates) the environment, agent and vault for one person. Safe to run again. */
export async function setupAssistant(deps: AssistantDeps, uid: string, publicUrl: string): Promise<AssistantRecord> {
  const { client, chat } = deps;
  const mcpUrl = `${publicUrl.replace(/\/$/, '')}/mcp`;
  const existing = await chat.getAssistant(uid);
  const agentParams = {
    name: 'Trinity',
    model: 'claude-opus-5-5',
    system: chatSystemPrompt(),
    mcp_servers: [{ type: 'url' as const, name: 'trinity', url: mcpUrl }],
    tools: [
      {
        type: 'agent_toolset_20260401' as const,
        default_config: { enabled: false },
        configs: [
          { name: 'web_search' as const, enabled: true, permission_policy: { type: 'always_allow' as const } },
          { name: 'web_fetch' as const, enabled: true, permission_policy: { type: 'always_allow' as const } },
        ],
      },
      {
        type: 'mcp_toolset' as const,
        mcp_server_name: 'trinity',
        default_config: { permission_policy: { type: 'auto' as const } },
        configs: READ_TOOLS.map((name) => ({ name, permission_policy: { type: 'always_allow' as const } })),
      },
    ],
  };

  if (existing && existing.mcpUrl === mcpUrl) {
    if (existing.personaVersion === PERSONA_VERSION) return existing;
    const agent = await client.beta.agents.update(existing.agentId, { ...agentParams, version: existing.agentVersion });
    const updated = { ...existing, agentVersion: agent.version, personaVersion: PERSONA_VERSION, updatedAt: Date.now() };
    await chat.putAssistant(uid, updated);
    return updated;
  }

  const environment = await client.beta.environments.create({ name: 'Trinity', config: { type: 'cloud', networking: { type: 'unrestricted' } } });
  const agent = await client.beta.agents.create(agentParams);
  const vault = await client.beta.vaults.create({ display_name: 'Trinity' });
  await client.beta.vaults.credentials.create(vault.id, {
    display_name: 'Trinity calendar and notes',
    auth: { type: 'static_bearer', token: await deps.issueAgentToken(uid), mcp_server_url: mcpUrl },
  });
  const record: AssistantRecord = {
    environmentId: environment.id,
    agentId: agent.id,
    agentVersion: agent.version,
    vaultId: vault.id,
    mcpUrl,
    personaVersion: PERSONA_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await chat.putAssistant(uid, record);
  return record;
}

/** A conversation Trinity starts (a check-in). The opener shows in the chat right away. */
export async function startCheckinConversation(deps: Pick<AssistantDeps, 'chat' | 'newId'>, uid: string, opener: string): Promise<string> {
  const now = Date.now();
  const c: Conversation = { id: deps.newId('cv'), kind: 'checkin', title: 'Check-in', sessionId: null, opener, createdAt: now, updatedAt: now };
  await deps.chat.putConversation(uid, c);
  await deps.chat.putMessage(uid, c.id, { id: deps.newId('m'), role: 'trinity', text: opener, at: now, status: 'done' });
  return c.id;
}

interface SessionEvent {
  id: string;
  type: string;
  content?: Array<{ type: string; text?: string }>;
  name?: string;
  input?: unknown;
  evaluated_permission?: string;
  stop_reason?: { type: string };
  error?: { message?: string };
}

const ACTIVITY: Record<string, string> = {
  get_schedule: 'Looking at your calendar…',
  find_free_time: 'Finding free time…',
  get_about_me: 'Remembering what you told me…',
  get_life_log: 'Looking at your log…',
  log_life: 'Writing that down…',
  log_checkin: 'Writing that down…',
  vault_search: 'Searching your notes…',
  vault_read: 'Reading your notes…',
  vault_list: 'Looking through your notes…',
  vault_recent: 'Looking through your notes…',
  vault_append: 'Adding to your daily note…',
  vault_create_note: 'Creating a note…',
  web_search: 'Looking that up…',
  web_fetch: 'Reading that page…',
};

const FRIENDLY_TOOL: Record<string, string> = {
  delete_block: 'Remove a block from your calendar',
  delete_life_entry: 'Remove a life-log entry',
  vault_create_note: 'Create or replace an Obsidian note',
  update_block: 'Change a block on your calendar',
  add_block: 'Add a block to your calendar',
};

function summarize(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const bits = ['title', 'path', 'id', 'start', 'date', 'summary'].filter((k) => i[k] !== undefined).map((k) => `${k}: ${String(i[k]).slice(0, 80)}`);
  return `${FRIENDLY_TOOL[name] ?? name}${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

function contextLine(tz: string, at: Date): string {
  const n = nowIn(tz, at);
  return `[${longDate(n.date)}, ${clockAp(n.minutes)} (${tz})]`;
}

export interface SendResult {
  conversationId: string;
  messageId: string;
  status: 'done' | 'waiting' | 'error';
}

export class ChatRelay {
  constructor(private deps: AssistantDeps) {}

  /** You said something (typed or spoken). Trinity's reply is written to Firestore as it arrives. */
  async send(uid: string, input: { conversationId?: string; text: string }): Promise<SendResult> {
    const { chat, client } = this.deps;
    const cfg = await chat.getAssistant(uid);
    if (!cfg) throw new Error('assistant_not_set_up');
    const now = Date.now();
    let conv = input.conversationId ? await chat.getConversation(uid, input.conversationId) : null;
    if (!conv) {
      conv = { id: input.conversationId || this.deps.newId('cv'), kind: 'chat', title: input.text.slice(0, 60), sessionId: null, createdAt: now, updatedAt: now };
    }
    await chat.putMessage(uid, conv.id, { id: this.deps.newId('m'), role: 'me', text: input.text, at: now, status: 'done' });
    const replyId = this.deps.newId('m');
    await chat.putMessage(uid, conv.id, { id: replyId, role: 'trinity', text: '', at: now + 1, status: 'streaming', activity: null, confirm: null });

    const tz = await this.deps.getTz(uid);
    const stamp = contextLine(tz, this.deps.clock?.() ?? new Date());
    try {
      if (!conv.sessionId) {
        const opener = conv.opener ? `[You started this check-in by messaging me: "${conv.opener}"]\n` : '';
        const session = await client.beta.sessions.create({
          agent: cfg.agentId,
          environment_id: cfg.environmentId,
          vault_ids: [cfg.vaultId],
          title: conv.kind === 'checkin' ? 'Trinity check-in' : 'Trinity chat',
          budget: { type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } },
          initial_events: [{ type: 'user.message', content: [{ type: 'text', text: `${stamp}\n${opener}${input.text}` }] }],
        });
        conv = { ...conv, sessionId: session.id, updatedAt: now };
        await chat.putConversation(uid, conv);
        // Events that happened before the stream opened are fetched from the history first.
        const stream = await client.beta.sessions.events.stream(session.id);
        const status = await this.pump(uid, conv.id, replyId, stream as AsyncIterable<SessionEvent>, session.id);
        return { conversationId: conv.id, messageId: replyId, status };
      }
      await chat.putConversation(uid, { ...conv, updatedAt: now });
      const stream = await client.beta.sessions.events.stream(conv.sessionId); // stream first, then send
      await client.beta.sessions.events.send(conv.sessionId, { events: [{ type: 'user.message', content: [{ type: 'text', text: `${stamp}\n${input.text}` }] }] });
      const status = await this.pump(uid, conv.id, replyId, stream as AsyncIterable<SessionEvent>);
      return { conversationId: conv.id, messageId: replyId, status };
    } catch (e) {
      console.error('chat send failed', e);
      await chat.patchMessage(uid, conv.id, replyId, { status: 'error', text: 'Sorry, I couldn’t answer just now. Try again in a moment.', activity: null });
      return { conversationId: conv.id, messageId: replyId, status: 'error' };
    }
  }

  /** You answered Trinity's "OK to do this?" question. */
  async confirm(uid: string, input: { conversationId: string; messageId: string; eventId: string; allow: boolean }): Promise<SendResult> {
    const { chat, client } = this.deps;
    const conv = await chat.getConversation(uid, input.conversationId);
    if (!conv?.sessionId) throw new Error('no_session');
    await chat.patchMessage(uid, conv.id, input.messageId, { status: 'streaming', confirm: null });
    const stream = await client.beta.sessions.events.stream(conv.sessionId);
    await client.beta.sessions.events.send(conv.sessionId, {
      events: [{ type: 'user.tool_confirmation', tool_use_id: input.eventId, result: input.allow ? 'allow' : 'deny', ...(input.allow ? {} : { deny_message: 'The person said no. Ask what they would like instead.' }) }],
    });
    const before = (await chat.getMessage(uid, conv.id, input.messageId))?.text ?? '';
    const status = await this.pump(uid, conv.id, input.messageId, stream as AsyncIterable<SessionEvent>, undefined, before);
    return { conversationId: conv.id, messageId: input.messageId, status };
  }

  private async pump(uid: string, conversationId: string, replyId: string, stream: AsyncIterable<SessionEvent>, catchUpSessionId?: string, initialText = ''): Promise<SendResult['status']> {
    const { chat, client } = this.deps;
    const seen = new Set<string>();
    let text = initialText;
    let lastWrite = 0;
    const flush = async (patch: Partial<ChatMessage> = {}, force = false) => {
      if (!force && Date.now() - lastWrite < 350) return;
      lastWrite = Date.now();
      await chat.patchMessage(uid, conversationId, replyId, { ...(text ? { text } : {}), ...patch });
    };

    const handle = async (ev: SessionEvent): Promise<SendResult['status'] | null> => {
      if (seen.has(ev.id)) return null;
      seen.add(ev.id);
      switch (ev.type) {
        case 'agent.message': {
          const t = (ev.content ?? []).map((b) => (b.type === 'text' ? b.text ?? '' : '')).join('').trim();
          if (t) text = text ? `${text} ${t}` : t;
          await flush({ activity: null });
          return null;
        }
        case 'agent.mcp_tool_use':
        case 'agent.tool_use': {
          const name = ev.name ?? '';
          if (ev.evaluated_permission === 'ask') {
            await flush({ confirm: { eventId: ev.id, tool: name, summary: summarize(name, ev.input) }, activity: null }, true);
          } else {
            await flush({ activity: ACTIVITY[name] ?? 'One moment…' }, true);
          }
          return null;
        }
        case 'session.status_idle': {
          if (ev.stop_reason?.type === 'requires_action') {
            await flush({ status: 'waiting', activity: null }, true);
            return 'waiting';
          }
          if (ev.stop_reason?.type === 'end_turn' || !ev.stop_reason) {
            await flush({ status: 'done', activity: null, text: text || '…' }, true);
            return 'done';
          }
          await flush({ status: 'error', activity: null, text: text || 'I had to stop there. Mind asking again?' }, true);
          return 'error';
        }
        case 'session.status_terminated':
          await flush({ status: 'error', activity: null, text: text || 'That conversation ended. Start a new one and I’m all yours.' }, true);
          return 'error';
        case 'session.error':
          console.warn('session.error', ev.error?.message);
          return null;
        default:
          return null;
      }
    };

    if (catchUpSessionId) {
      for await (const ev of client.beta.sessions.events.list(catchUpSessionId) as AsyncIterable<SessionEvent>) {
        const r = await handle(ev);
        if (r) return r;
      }
    }
    for await (const ev of stream) {
      const r = await handle(ev);
      if (r) return r;
    }
    await flush({ status: text ? 'done' : 'error', activity: null }, true);
    return text ? 'done' : 'error';
  }
}

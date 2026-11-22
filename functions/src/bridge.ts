import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Obsidian access goes through a small helper on your Mac (bridge/). Trinity's server puts a job in
 * users/{uid}/bridge_jobs; the Mac picks it up, works on the vault folder, and writes the result back.
 */
export type VaultOp = 'search' | 'read' | 'list' | 'recent' | 'append' | 'write';

export interface BridgeJob {
  id: string;
  op: VaultOp;
  args: Record<string, string | number | boolean>;
  status: 'pending' | 'done' | 'error';
  result?: string;
  error?: string;
  createdAt: number;
  doneAt?: number;
}

export interface BridgeInfo {
  lastSeen: number;
  vaultName?: string;
  version?: string;
}

export interface BridgeStore {
  enqueue(uid: string, op: VaultOp, args: BridgeJob['args']): Promise<string>;
  getJob(uid: string, id: string): Promise<BridgeJob | null>;
  bridgeInfo(uid: string): Promise<BridgeInfo | null>;
}

export class MemoryBridgeStore implements BridgeStore {
  jobs = new Map<string, BridgeJob>();
  info = new Map<string, BridgeInfo>();
  private seq = 0;
  async enqueue(uid: string, op: VaultOp, args: BridgeJob['args']) {
    const id = `j${++this.seq}`;
    this.jobs.set(`${uid}/${id}`, { id, op, args, status: 'pending', createdAt: Date.now() });
    return id;
  }
  async getJob(uid: string, id: string) {
    return this.jobs.get(`${uid}/${id}`) ?? null;
  }
  async bridgeInfo(uid: string) {
    return this.info.get(uid) ?? null;
  }
  /** Test helper: act like the Mac and finish a job. */
  finish(uid: string, id: string, result: string, error?: string) {
    const j = this.jobs.get(`${uid}/${id}`);
    if (j) Object.assign(j, error ? { status: 'error', error } : { status: 'done', result }, { doneAt: Date.now() });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface VaultToolOptions {
  store: BridgeStore;
  uid: string;
  /** How long to wait for the Mac before giving up. */
  waitMs?: number;
  pollMs?: number;
}

/** The Mac counts as connected if it checked in within the last 3 minutes. */
export function macOnline(info: BridgeInfo | null, now = Date.now()): boolean {
  return !!info && now - info.lastSeen < 3 * 60 * 1000;
}

export function registerVaultTools(server: McpServer, opts: VaultToolOptions) {
  const { store, uid } = opts;
  const waitMs = opts.waitMs ?? 20_000;
  const pollMs = opts.pollMs ?? 400;
  const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
  const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });

  /** Runs a job on the Mac. Writes stay queued when the Mac is asleep; reads need it awake. */
  async function run(op: VaultOp, args: BridgeJob['args'], queueIfAsleep: boolean) {
    const info = await store.bridgeInfo(uid);
    if (!info) return fail('Obsidian isn’t connected yet. In Trinity: Settings → Obsidian on your Mac.');
    const id = await store.enqueue(uid, op, args);
    if (!macOnline(info) && queueIfAsleep) return text('Your Mac is asleep, so I queued this. It will be saved to Obsidian when the Mac wakes up.');
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      const job = await store.getJob(uid, id);
      if (job?.status === 'done') return text(job.result || 'Done.');
      if (job?.status === 'error') return fail(job.error || 'The Mac couldn’t do that.');
      await sleep(pollMs);
    }
    return queueIfAsleep
      ? text('Your Mac didn’t answer in time, so this is queued and will be saved when it’s back.')
      : fail('I can’t reach your Mac right now (it may be asleep), so I can’t open Obsidian notes at the moment.');
  }

  server.registerTool(
    'vault_search',
    {
      title: 'Search my Obsidian notes',
      description: "Full-text search across the person's Obsidian vault (projects, journal, goals, notes). Returns matching note paths with snippets.",
      inputSchema: { query: z.string().min(1).max(200), limit: z.number().int().min(1).max(20).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => run('search', { query, limit: limit ?? 8 }, false),
  );

  server.registerTool(
    'vault_read',
    {
      title: 'Read an Obsidian note',
      description: 'Read one note by its path inside the vault (as returned by vault_search, vault_list or vault_recent).',
      inputSchema: { path: z.string().min(1).max(500) },
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => run('read', { path }, false),
  );

  server.registerTool(
    'vault_list',
    {
      title: 'List a folder in Obsidian',
      description: 'List notes and subfolders in a vault folder. Leave folder empty for the top level.',
      inputSchema: { folder: z.string().max(500).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ folder }) => run('list', { folder: folder ?? '' }, false),
  );

  server.registerTool(
    'vault_recent',
    {
      title: 'Recently changed notes',
      description: 'Notes changed in the last few days, newest first. Good for "what have I been working on?".',
      inputSchema: { days: z.number().int().min(1).max(60).optional(), limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ days, limit }) => run('recent', { days: days ?? 7, limit: limit ?? 15 }, false),
  );

  server.registerTool(
    'vault_append',
    {
      title: 'Add to an Obsidian note',
      description:
        "Append text to a note. With no path it goes into today's daily note (or the daily note for `date`) under the heading, which defaults to “Trinity”. " +
        'Creates the note if it does not exist. Queued if the Mac is asleep.',
      inputSchema: {
        text: z.string().min(1).max(10_000),
        path: z.string().max(500).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        heading: z.string().max(120).optional(),
      },
    },
    async (a) => {
      const args: BridgeJob['args'] = { text: a.text, heading: a.heading ?? 'Trinity' };
      if (a.path) args.path = a.path;
      if (a.date) args.date = a.date;
      return run('append', args, true);
    },
  );

  server.registerTool(
    'vault_create_note',
    {
      title: 'Create an Obsidian note',
      description: 'Create a new note at a path inside the vault. Refuses to overwrite an existing note unless overwrite is true (ask first).',
      inputSchema: { path: z.string().min(1).max(500), content: z.string().max(100_000), overwrite: z.boolean().optional() },
      annotations: { destructiveHint: true },
    },
    async (a) => run('write', { path: a.path, content: a.content, overwrite: a.overwrite ?? false }, true),
  );
}

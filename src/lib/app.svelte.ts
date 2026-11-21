import { LocalBackend, type AuthUser, type Backend, type Unsubscribe } from './backend';
import type { FirebaseSession } from './firebase';
import { firebaseConfigFromEnv } from './firebase-config';
import { uid } from './id';
import { findFreeSlot } from './layout';
import { dayToMarkdown, parseDayMarkdown } from './markdown';
import type { QuickAdd } from './parse';
import { addDays, clamp, monthGrid, nowMinutes, shortDate, timeRange, todayIso } from './time';
import { DEFAULT_SETTINGS, type Block, type CategoryId, type DayMeta, type Settings, type Subtask, type Task } from './types';

export type View = 'day' | 'month';
export type Mode = 'local' | 'firebase';

interface Toast {
  id: number;
  msg: string;
  action?: { label: string; run: () => void };
}

class AppState {
  mode = $state<Mode>('local');
  authReady = $state(false);
  user = $state<AuthUser | null>(null);
  localOnly = $state(false); // signed-in mode available, but the person chose this device only
  backend = $state<Backend>(new LocalBackend());
  firebase: FirebaseSession | null = null;

  blocks = $state<Block[]>([]);
  tasks = $state<Task[]>([]);
  days = $state<Record<string, DayMeta>>({});
  settings = $state<Settings>({ ...DEFAULT_SETTINGS });
  loaded = $state(false);

  date = $state(todayIso());
  view = $state<View>('day');
  selectedId = $state<string | null>(null);
  today = $state(todayIso());
  now = $state(nowMinutes());
  toast = $state<Toast | null>(null);
  settingsOpen = $state(false);
  quickAddOpen = $state(false);
  focusTitleId = $state<string | null>(null);

  dayBlocks = $derived(this.blocks.filter((b) => b.date === this.date).sort((a, b) => a.start - b.start || a.end - b.end));
  selected = $derived(this.blocks.find((b) => b.id === this.selectedId) ?? null);
  openTasks = $derived(this.tasks.filter((t) => !t.done).sort((a, b) => a.createdAt - b.createdAt));
  intention = $derived(this.days[this.date]?.intention ?? '');
  /** The block happening right now (today only). */
  current = $derived(
    this.date === this.today ? this.dayBlocks.find((b) => !b.done && b.start <= this.now && this.now < b.end) ?? null : null,
  );
  next = $derived(
    this.blocks
      .filter((b) => b.date === this.today && !b.done && b.start > this.now)
      .sort((a, b) => a.start - b.start)[0] ?? null,
  );

  private subs: Unsubscribe[] = [];
  private rangeKey = '';
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastSeq = 0;

  async init() {
    setInterval(() => this.tick(), 20_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.tick());
    const cfg = firebaseConfigFromEnv();
    if (!cfg) {
      this.mode = 'local';
      this.authReady = true;
      this.resubscribe(true);
      return;
    }
    this.mode = 'firebase';
    const { FirebaseSession } = await import('./firebase');
    this.firebase = new FirebaseSession(cfg);
    this.firebase.onUser((u) => {
      this.user = u;
      this.authReady = true;
      this.backend = u && this.firebase ? this.firebase.backendFor(u.uid) : new LocalBackend();
      this.resubscribe(true);
    });
  }

  tick() {
    const prevToday = this.today;
    this.now = nowMinutes();
    this.today = todayIso();
    if (prevToday !== this.today && this.date === prevToday) this.date = this.today;
  }

  /** Subscribe to the month around the selected date (plus padding for week strips). */
  resubscribe(force = false) {
    const grid = monthGrid(this.date, this.settings.weekStart);
    const from = addDays(grid[0].date, -7);
    const to = addDays(grid[grid.length - 1].date, 7);
    const key = `${this.backend.kind}:${this.user?.uid ?? ''}:${from}:${to}`;
    if (!force && key === this.rangeKey) return;
    this.rangeKey = key;
    for (const u of this.subs) u();
    const b = this.backend;
    this.subs = [
      b.watchBlocks(from, to, (blocks) => {
        this.blocks = blocks;
        this.loaded = true;
      }),
      b.watchTasks((tasks) => (this.tasks = tasks)),
      b.watchDays(from, to, (days) => (this.days = Object.fromEntries(days.map((d) => [d.date, d])))),
      b.watchSettings((s) => (this.settings = { ...DEFAULT_SETTINGS, ...s })),
    ];
  }

  async signIn() {
    try {
      await this.firebase?.signIn();
    } catch (e) {
      this.flash(`Sign-in didn’t finish: ${(e as Error).message}`);
    }
  }

  async signOut() {
    await this.firebase?.signOut();
    this.settingsOpen = false;
  }

  useThisDeviceOnly() {
    this.localOnly = true;
  }

  // ---------- navigation ----------
  goTo(date: string, view?: View) {
    this.date = date;
    if (view) this.view = view;
    this.selectedId = null;
  }

  shiftDay(n: number) {
    this.goTo(addDays(this.date, n));
  }

  select(id: string | null) {
    this.selectedId = id;
  }

  // ---------- toasts ----------
  flash(msg: string, action?: Toast['action']) {
    clearTimeout(this.toastTimer);
    this.toast = { id: ++this.toastSeq, msg, action };
    this.toastTimer = setTimeout(() => (this.toast = null), action ? 5000 : 2800);
  }

  // ---------- blocks ----------
  async addBlock(input: { date: string; start: number; end: number; title: string; cat: CategoryId; notes?: string; subtasks?: Subtask[] }, opts: { select?: boolean; focus?: boolean } = {}) {
    const t = Date.now();
    const b: Block = {
      id: uid('b'),
      date: input.date,
      start: input.start,
      end: Math.max(input.start + 5, input.end),
      title: input.title,
      cat: input.cat,
      done: false,
      notes: input.notes ?? '',
      subtasks: input.subtasks ?? [],
      source: 'app',
      createdAt: t,
      updatedAt: t,
    };
    await this.backend.putBlock(b);
    if (opts.select) this.selectedId = b.id;
    if (opts.focus) this.focusTitleId = b.id;
    return b;
  }

  async updateBlock(id: string, patch: Partial<Omit<Block, 'id'>>) {
    const cur = this.blocks.find((b) => b.id === id);
    if (!cur) return;
    const next: Block = { ...cur, ...patch, updatedAt: Date.now() };
    if (next.end <= next.start) next.end = next.start + 5;
    // Update in place first so drags and typing feel instant.
    this.blocks = this.blocks.map((b) => (b.id === id ? next : b));
    await this.backend.putBlock($state.snapshot(next) as Block);
  }

  async deleteBlock(id: string) {
    const cur = this.blocks.find((b) => b.id === id);
    if (!cur) return;
    const copy = $state.snapshot(cur) as Block;
    if (this.selectedId === id) this.selectedId = null;
    await this.backend.deleteBlock(id);
    this.flash(`Deleted “${copy.title}”`, { label: 'Undo', run: () => this.backend.putBlock(copy) });
  }

  async toggleDone(id: string) {
    const b = this.blocks.find((x) => x.id === id);
    if (!b) return;
    await this.updateBlock(id, { done: !b.done });
    if (!b.done) this.flash(`Done: ${b.title}`, { label: 'Undo', run: () => this.updateBlock(id, { done: false }) });
  }

  async extend(id: string, minutes: number) {
    const b = this.blocks.find((x) => x.id === id);
    if (!b) return;
    await this.updateBlock(id, { end: clamp(b.end + minutes, b.start + 5, 24 * 60) });
  }

  async moveToDate(id: string, date: string) {
    const b = this.blocks.find((x) => x.id === id);
    if (!b) return;
    const before = $state.snapshot(b) as Block;
    await this.updateBlock(id, { date, done: false });
    if (this.selectedId === id) this.selectedId = null;
    this.flash(`Moved “${b.title}” to ${shortDate(date)}`, { label: 'Undo', run: () => this.backend.putBlock(before) });
  }

  // ---------- tasks (unscheduled) ----------
  async addTask(title: string, estimate = 30, cat: CategoryId = 'personal') {
    const t = Date.now();
    await this.backend.putTask({ id: uid('t'), title, estimate, cat, done: false, createdAt: t, updatedAt: t });
  }

  async toggleTask(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (t) await this.backend.putTask({ ...($state.snapshot(t) as Task), done: !t.done, updatedAt: Date.now() });
  }

  async deleteTask(id: string) {
    await this.backend.deleteTask(id);
  }

  /** Put a task on the timeline at `start`, or in the next free slot. */
  async scheduleTask(id: string, date = this.date, start?: number) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    const { dayStart, dayEnd, snap } = this.settings;
    let at = start;
    if (at === undefined) {
      const busy = this.blocks.filter((b) => b.date === date);
      const after = date === this.today ? this.now : Math.max(dayStart, 9 * 60);
      at = findFreeSlot(busy, t.estimate, after, dayStart, dayEnd, snap) ?? undefined;
      if (at === undefined) {
        this.flash('No free slot left on that day');
        return;
      }
    }
    const b = await this.addBlock({ date, start: at, end: at + t.estimate, title: t.title, cat: t.cat });
    await this.backend.deleteTask(id);
    this.flash(`Scheduled “${t.title}” · ${timeRange(b.start, b.end)}`);
  }

  // ---------- quick add ----------
  async quickAdd(p: QuickAdd) {
    if (p.start === null) {
      await this.addTask(p.title, p.duration === 60 ? 30 : p.duration, p.cat);
      this.flash(`Added “${p.title}” to Unscheduled`);
      return;
    }
    const b = await this.addBlock({ date: p.date, start: p.start, end: p.start + p.duration, title: p.title, cat: p.cat });
    const where = p.date === this.date ? '' : ` on ${shortDate(p.date)}`;
    this.flash(`Added “${p.title}”${where} · ${timeRange(b.start, b.end)}`, p.date === this.date ? undefined : { label: 'View', run: () => this.goTo(p.date, 'day') });
    if (p.date === this.date) this.selectedId = b.id;
  }

  // ---------- day meta ----------
  async setIntention(text: string) {
    await this.backend.putDay({ date: this.date, intention: text, updatedAt: Date.now() });
  }

  // ---------- settings ----------
  async setSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    await this.backend.putSettings($state.snapshot(this.settings) as Settings);
    if (patch.weekStart !== undefined) this.resubscribe();
  }

  // ---------- markdown ----------
  exportDay(date = this.date): string {
    const blocks = this.blocks.filter((b) => b.date === date);
    return dayToMarkdown(date, this.days[date]?.intention ?? '', $state.snapshot(blocks) as Block[], date === this.date ? ($state.snapshot(this.openTasks) as Task[]) : []);
  }

  async importDay(md: string) {
    const day = parseDayMarkdown(md);
    const date = day.date && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : this.date;
    for (const b of day.blocks) {
      const created = await this.addBlock({ date, start: b.start, end: b.end, title: b.title, cat: b.cat, notes: b.notes, subtasks: b.subtasks.map((s) => ({ ...s, id: uid('s') })) });
      if (b.done || b.byClaude) await this.updateBlock(created.id, { done: b.done, source: b.byClaude ? 'claude' : 'import' });
    }
    for (const t of day.tasks) if (!t.done) await this.addTask(t.title, t.estimate, t.cat);
    if (day.intention) await this.backend.putDay({ date, intention: day.intention, updatedAt: Date.now() });
    this.goTo(date, 'day');
    this.flash(`Imported ${day.blocks.length} blocks${day.tasks.length ? ` and ${day.tasks.length} tasks` : ''}`);
  }

  async loadSample() {
    const d = this.today;
    const s = (text: string, done = false): Subtask => ({ id: uid('s'), text, done });
    const sample: Array<Parameters<AppState['addBlock']>[0]> = [
      { date: d, start: 420, end: 465, title: 'Morning routine', cat: 'health', subtasks: [s('Stretch'), s('Journal three lines')] },
      { date: d, start: 480, end: 510, title: 'Plan the day', cat: 'admin' },
      { date: d, start: 510, end: 630, title: 'Deep work: proposal draft', cat: 'deep', notes: 'Lead with the outcome. Keep it under six pages.', subtasks: [s('Outline sections 1–3'), s('Pull Q3 numbers'), s('Write the executive summary'), s('Send for review')] },
      { date: d, start: 630, end: 645, title: 'Break', cat: 'break' },
      { date: d, start: 660, end: 720, title: 'Call with Sam', cat: 'meet' },
      { date: d, start: 720, end: 780, title: 'Lunch & a walk', cat: 'personal' },
      { date: d, start: 810, end: 900, title: 'Studio session', cat: 'deep', subtasks: [s('Fix vocal levels'), s('Bounce two versions')] },
      { date: d, start: 900, end: 930, title: 'Inbox zero', cat: 'admin' },
      { date: d, start: 960, end: 1020, title: 'Gym', cat: 'health' },
      { date: d, start: 1080, end: 1140, title: 'Dinner with friends', cat: 'personal' },
    ];
    for (const b of sample) await this.addBlock(b);
    await this.addTask('Reply to landlord', 15, 'admin');
    await this.addTask('Buy birthday gift', 30, 'personal');
    await this.backend.putDay({ date: d, intention: 'Ship the proposal draft before lunch.', updatedAt: Date.now() });
    this.goTo(d, 'day');
  }
}

export const app = new AppState();

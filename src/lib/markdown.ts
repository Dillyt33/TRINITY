import type { Block, CategoryId, Subtask, Task } from './types';
import { CATEGORY_IDS } from './types';
import { hhmm } from './time';
import { categoryFromTag } from './parse';

/**
 * Markdown format (same as the v1 plan):
 *
 * ---
 * date: 2026-11-21
 * intention: Ship the proposal draft
 * ---
 * ## Plan
 * - [x] 07:00-07:45 Morning routine #health
 * - [ ] 08:30-10:30 Deep work: proposal draft #deep
 *     - [ ] Send to Alex
 *     > notes line
 * - [ ] 11:00-12:00 Call with Sam #meet ✦
 * ## Unscheduled
 * - [ ] Reply to landlord ~15m #admin
 */

export function dayToMarkdown(date: string, intention: string, blocks: Block[], tasks: Task[]): string {
  const out: string[] = ['---', `date: ${date}`];
  if (intention) out.push(`intention: ${intention.replace(/\n/g, ' ')}`);
  out.push('---', '', '## Plan');
  for (const b of [...blocks].sort((a, z) => a.start - z.start)) {
    const mark = b.source === 'claude' || b.source === 'coach' ? ' ✦' : '';
    out.push(`- [${b.done ? 'x' : ' '}] ${hhmm(b.start)}-${hhmm(b.end)} ${b.title} #${b.cat}${mark}`);
    for (const s of b.subtasks) out.push(`    - [${s.done ? 'x' : ' '}] ${s.text}`);
    if (b.notes.trim()) for (const line of b.notes.trim().split('\n')) out.push(`    > ${line}`);
  }
  if (tasks.length) {
    out.push('', '## Unscheduled');
    for (const t of tasks) out.push(`- [${t.done ? 'x' : ' '}] ${t.title} ~${t.estimate}m #${t.cat}`);
  }
  return out.join('\n') + '\n';
}

export interface ParsedBlock {
  start: number;
  end: number;
  title: string;
  cat: CategoryId;
  done: boolean;
  notes: string;
  subtasks: Subtask[];
  byClaude: boolean;
}

export interface ParsedTask {
  title: string;
  estimate: number;
  cat: CategoryId;
  done: boolean;
}

export interface ParsedDay {
  date: string | null;
  intention: string;
  blocks: ParsedBlock[];
  tasks: ParsedTask[];
}

const BLOCK_RE = /^[-*]\s+\[( |x|X)\]\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s+(.+)$/;
const TASK_RE = /^[-*]\s+\[( |x|X)\]\s+(.+)$/;
const SUB_RE = /^\s{2,}[-*]\s+\[( |x|X)\]\s+(.+)$/;
const NOTE_RE = /^\s{2,}>\s?(.*)$/;

function takeTag(text: string): { text: string; cat: CategoryId | null } {
  const m = text.match(/\s#([a-z][\w-]*)\b/i);
  if (!m) return { text, cat: null };
  const known = (CATEGORY_IDS as string[]).includes(m[1].toLowerCase()) ? (m[1].toLowerCase() as CategoryId) : categoryFromTag(m[1]);
  return { text: text.replace(m[0], '').trim(), cat: known ?? 'personal' };
}

export function parseDayMarkdown(md: string): ParsedDay {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const day: ParsedDay = { date: null, intention: '', blocks: [], tasks: [] };
  let i = 0;
  if (lines[0]?.trim() === '---') {
    for (i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
      const kv = lines[i].match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      if (kv[1] === 'date') day.date = kv[2].trim();
      if (kv[1] === 'intention') day.intention = kv[2].trim();
    }
    i++;
  }
  let section: 'plan' | 'unscheduled' | 'other' = 'plan';
  let last: ParsedBlock | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      const name = h[1].trim().toLowerCase();
      section = name.startsWith('plan') ? 'plan' : name.startsWith('unscheduled') || name.startsWith('inbox') || name.startsWith('todo') ? 'unscheduled' : 'other';
      last = null;
      continue;
    }
    if (section === 'other') continue;
    const sub = line.match(SUB_RE);
    if (sub && last) {
      last.subtasks.push({ id: `s${last.subtasks.length + 1}`, text: sub[2].trim(), done: sub[1] !== ' ' });
      continue;
    }
    const note = line.match(NOTE_RE);
    if (note && last) {
      last.notes = last.notes ? `${last.notes}\n${note[1]}` : note[1];
      continue;
    }
    const b = line.match(BLOCK_RE);
    if (b) {
      let rest = b[6].trim();
      const byClaude = /\s?✦\s*$/.test(rest);
      rest = rest.replace(/\s?✦\s*$/, '');
      const { text, cat } = takeTag(` ${rest}`);
      let end = Number(b[4]) * 60 + Number(b[5]);
      const start = Number(b[2]) * 60 + Number(b[3]);
      if (end <= start) end += 24 * 60;
      last = { start, end, title: text.trim(), cat: cat ?? 'personal', done: b[1] !== ' ', notes: '', subtasks: [], byClaude };
      day.blocks.push(last);
      continue;
    }
    const t = line.match(TASK_RE);
    if (t) {
      last = null;
      let rest = ` ${t[2].trim()}`;
      let estimate = 30;
      const est = rest.match(/\s~(\d+)\s*(m|h)\b/i);
      if (est) {
        estimate = Number(est[1]) * (est[2].toLowerCase() === 'h' ? 60 : 1);
        rest = rest.replace(est[0], '');
      }
      const { text, cat } = takeTag(rest);
      day.tasks.push({ title: text.trim(), estimate, cat: cat ?? 'personal', done: t[1] !== ' ' });
    }
  }
  return day;
}

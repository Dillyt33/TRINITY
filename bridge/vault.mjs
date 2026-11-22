// Trinity's hands in your Obsidian vault. Everything stays inside the vault folder.
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const MAX_FILES = 20000;
const MAX_READ = 30000;

export class Vault {
  /**
   * @param {string} root absolute path of the vault folder
   * @param {{ dailyFolder?: string, dailyFormat?: string }} [daily]
   */
  constructor(root, daily = {}) {
    this.root = resolve(root);
    this.dailyFolder = daily.dailyFolder ?? 'Daily';
    this.dailyFormat = daily.dailyFormat ?? 'YYYY-MM-DD';
  }

  /** Vault-relative path to an absolute path, refusing anything outside the vault or in hidden folders. */
  resolve(rel) {
    const clean = String(rel ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (clean.split('/').some((part) => part === '..' || part.startsWith('.'))) throw new Error(`Not allowed: ${rel}`);
    const abs = resolve(this.root, clean);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) throw new Error(`Outside the vault: ${rel}`);
    return abs;
  }

  /** Also checks symlinks don't lead out of the vault. */
  async safe(rel) {
    const abs = this.resolve(rel);
    const realRoot = await realpath(this.root);
    let probe = abs;
    for (;;) {
      try {
        const real = await realpath(probe);
        if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error(`Outside the vault: ${rel}`);
        return abs;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        const up = dirname(probe);
        if (up === probe) return abs;
        probe = up;
      }
    }
  }

  async *walk(dir = this.root, count = { n: 0 }) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) yield* this.walk(abs, count);
      else if (e.isFile() && e.name.endsWith('.md')) {
        if (++count.n > MAX_FILES) return;
        yield abs;
      }
    }
  }

  rel(abs) {
    return relative(this.root, abs).split(sep).join('/');
  }

  async search(query, limit = 8) {
    const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return 'Nothing to search for.';
    const hits = [];
    for await (const abs of this.walk()) {
      let text;
      try {
        const s = await stat(abs);
        if (s.size > 2_000_000) continue;
        text = await readFile(abs, 'utf8');
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      const name = this.rel(abs).toLowerCase();
      let score = 0;
      let matched = 0;
      for (const w of words) {
        const inName = name.includes(w);
        let count = 0;
        let i = lower.indexOf(w);
        while (i !== -1 && count < 5) {
          count++;
          i = lower.indexOf(w, i + w.length);
        }
        if (count || inName) matched++;
        score += count + (inName ? 5 : 0);
      }
      if (!matched) continue;
      score += matched === words.length ? 10 : 0;
      const at = lower.indexOf(words[0]);
      const snippet = at === -1 ? text.slice(0, 160) : text.slice(Math.max(0, at - 80), at + 160);
      hits.push({ path: this.rel(abs), score, snippet: snippet.replace(/\s+/g, ' ').trim() });
    }
    hits.sort((a, b) => b.score - a.score);
    const top = hits.slice(0, limit);
    return top.length ? top.map((h) => `- ${h.path} — …${h.snippet}…`).join('\n') : `No notes mention “${query}”.`;
  }

  async read(rel) {
    const abs = await this.safe(rel);
    const text = await readFile(abs, 'utf8');
    return text.length > MAX_READ ? `${text.slice(0, MAX_READ)}\n\n…(truncated, ${text.length} characters in total)` : text;
  }

  async list(folder = '') {
    const abs = await this.safe(folder);
    const entries = (await readdir(abs, { withFileTypes: true })).filter((e) => !e.name.startsWith('.'));
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => `${e.name}/`).sort();
    const notes = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name).sort();
    const all = [...dirs, ...notes].slice(0, 200);
    return all.length ? `${folder || '(vault)'}:\n${all.map((n) => `- ${n}`).join('\n')}` : `${folder || 'The vault'} is empty.`;
  }

  async recent(days = 7, limit = 15) {
    const since = Date.now() - days * 24 * 3600 * 1000;
    const files = [];
    for await (const abs of this.walk()) {
      try {
        const s = await stat(abs);
        if (s.mtimeMs >= since) files.push({ path: this.rel(abs), at: s.mtimeMs });
      } catch {
        /* skip */
      }
    }
    files.sort((a, b) => b.at - a.at);
    const fmt = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return files.length ? files.slice(0, limit).map((f) => `- ${f.path} (${fmt(f.at)})`).join('\n') : `No notes changed in the last ${days} days.`;
  }

  /** Daily note path for YYYY-MM-DD, using the vault's daily-note folder and format. */
  dailyPath(date) {
    const [y, m, d] = date.split('-');
    const name = this.dailyFormat.replace(/YYYY/g, y).replace(/MM/g, m).replace(/DD/g, d);
    return `${this.dailyFolder ? `${this.dailyFolder}/` : ''}${name}.md`;
  }

  /** Adds text under a heading (creating the note or heading if needed). */
  async append(text, { path, date, heading = 'Trinity' } = {}) {
    const rel = path ? (path.endsWith('.md') ? path : `${path}.md`) : this.dailyPath(date ?? localDate());
    const abs = await this.safe(rel);
    await mkdir(dirname(abs), { recursive: true });
    let body;
    try {
      body = await readFile(abs, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      body = null;
    }
    const addition = String(text).replace(/\s+$/, '');
    if (body === null) {
      await writeFile(abs, `${heading ? `## ${heading}\n` : ''}${addition}\n`, 'utf8');
      return `Added to ${rel} (new note).`;
    }
    if (!heading) {
      await writeFile(abs, `${body.replace(/\s*$/, '\n')}${addition}\n`, 'utf8');
      return `Added to ${rel}.`;
    }
    const lines = body.split('\n');
    const h = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
    if (h === -1) {
      await writeFile(abs, `${body.replace(/\s*$/, '\n')}\n## ${heading}\n${addition}\n`, 'utf8');
      return `Added to ${rel} under a new “${heading}” heading.`;
    }
    let end = lines.length;
    for (let i = h + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    while (end > h + 1 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, ...addition.split('\n'));
    await writeFile(abs, lines.join('\n').replace(/\n*$/, '\n'), 'utf8');
    return `Added to ${rel} under “${heading}”.`;
  }

  async write(rel, content, overwrite = false) {
    const path = rel.endsWith('.md') ? rel : `${rel}.md`;
    const abs = await this.safe(path);
    await mkdir(dirname(abs), { recursive: true });
    if (!overwrite) {
      try {
        await stat(abs);
        throw new Error(`${path} already exists. Ask before replacing it.`);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    await writeFile(abs, String(content), 'utf8');
    return `${overwrite ? 'Saved' : 'Created'} ${path}.`;
  }

  /** Runs one job from Trinity's server. */
  async run(op, args) {
    switch (op) {
      case 'search':
        return this.search(args.query, Number(args.limit ?? 8));
      case 'read':
        return this.read(args.path);
      case 'list':
        return this.list(args.folder ?? '');
      case 'recent':
        return this.recent(Number(args.days ?? 7), Number(args.limit ?? 15));
      case 'append':
        return this.append(args.text, { path: args.path, date: args.date, heading: args.heading });
      case 'write':
        return this.write(args.path, args.content, !!args.overwrite);
      default:
        throw new Error(`Unknown job: ${op}`);
    }
  }
}

export function localDate(at = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

export function localTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const AREAS = { sleep: 'Sleep', food: 'Diet', exercise: 'Exercise', mood: 'Mood', study: 'Study', project: 'Projects', money: 'Finance', health: 'Health', mind: 'Mental health' };
const MOODS = { great: 'great', good: 'good', meh: 'meh', rough: 'rough' };

/** One daily-note line for a life-log entry or check-in. */
export function logLine(kind, doc) {
  const time = localTime(Number(doc.at ?? Date.now()));
  if (kind === 'life') return `- ${time} · ${AREAS[doc.area] ?? doc.area} · ${doc.summary}`;
  if (doc.kind === 'block') return `- ${time} · Check-in · ${doc.blockTitle ?? 'Block'}: ${doc.outcome}${doc.note ? ` — ${doc.note}` : ''}`;
  return `- ${time} · Check-in · Feeling ${MOODS[doc.mood] ?? doc.mood}${doc.note ? ` — ${doc.note}` : ''}`;
}

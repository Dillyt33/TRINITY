#!/usr/bin/env node
// Trinity's helper for your Mac: lets Trinity read and write your Obsidian vault (in iCloud Drive),
// and copies what Trinity records (sleep, food, mood, check-ins…) into your daily notes.
//
//   node trinity-bridge.mjs setup <code-from-Trinity> --vault "/path/to/vault" [--daily-folder Daily] [--daily-format YYYY-MM-DD]
//   node trinity-bridge.mjs test      one check: signs in, reads the vault, reports back
//   node trinity-bridge.mjs run       keep running (install.sh starts this at login)
import { chmod, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { FirebaseUser } from './firestore.mjs';
import { Vault, logLine } from './vault.mjs';

const VERSION = '1.0.0';
const DIR = join(homedir(), '.trinity');
const CONFIG = join(DIR, 'bridge.json');
const STATE = join(DIR, 'bridge-state.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveJson(path, data) {
  await mkdir(DIR, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function setup() {
  const code = process.argv[3];
  const vaultPath = arg('--vault');
  if (!code || !vaultPath) {
    console.error('Usage: node trinity-bridge.mjs setup <code> --vault "/path/to/your/vault"');
    process.exit(1);
  }
  let creds;
  try {
    creds = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
  } catch {
    console.error('That setup code looks incomplete. Copy it again from Trinity → Settings → Obsidian on your Mac.');
    process.exit(1);
  }
  try {
    const s = await stat(join(vaultPath, '.obsidian'));
    if (!s.isDirectory()) throw new Error();
  } catch {
    console.error(`No Obsidian vault at ${vaultPath} (no .obsidian folder). In Obsidian: Settings → About → "Open vault folder" shows where it is.`);
    process.exit(1);
  }
  const config = { ...creds, vaultPath, dailyFolder: arg('--daily-folder', 'Daily'), dailyFormat: arg('--daily-format', 'YYYY-MM-DD'), heading: arg('--heading', 'Trinity') };
  const user = new FirebaseUser(config);
  await user.token(); // proves the code works
  await saveJson(CONFIG, config);
  await saveJson(STATE, { lifeAt: Date.now(), checkinAt: Date.now() });
  console.log(`Saved. Vault: ${basename(vaultPath)}. Daily notes: ${config.dailyFolder}/${config.dailyFormat}.md`);
  console.log('Next: run ./install.sh so it starts automatically, or "node trinity-bridge.mjs test" to check.');
}

async function context() {
  const config = await loadJson(CONFIG, null);
  if (!config) {
    console.error('Not set up yet. Run: node trinity-bridge.mjs setup <code> --vault "/path/to/vault"');
    process.exit(1);
  }
  const user = new FirebaseUser(config, (token) => saveJson(CONFIG, { ...config, refreshToken: token }).catch(() => undefined));
  const vault = new Vault(config.vaultPath, { dailyFolder: config.dailyFolder, dailyFormat: config.dailyFormat });
  return { config, user, vault };
}

async function heartbeat(user, config) {
  await user.patch('meta/bridge', { lastSeen: Date.now(), vaultName: basename(config.vaultPath), version: VERSION });
}

/** Jobs Trinity queued: search, read, append… */
async function doJobs(user, vault) {
  const jobs = await user.query('bridge_jobs', 'status', 'EQUAL', 'pending', 10);
  for (const job of jobs.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      const result = await vault.run(job.op, job.args ?? {});
      await user.patch(`bridge_jobs/${job.id}`, { status: 'done', result: String(result).slice(0, 100_000), doneAt: Date.now() });
      log('done', job.op);
    } catch (e) {
      await user.patch(`bridge_jobs/${job.id}`, { status: 'error', error: e.message ?? String(e), doneAt: Date.now() });
      log('failed', job.op, e.message);
    }
  }
  return jobs.length;
}

/** Copies new life-log entries and check-ins into the daily note. */
async function mirror(user, vault, config, state) {
  let changed = false;
  for (const [collection, key, kind] of [['life', 'lifeAt', 'life'], ['checkins', 'checkinAt', 'checkin']]) {
    const docs = (await user.query(collection, 'at', 'GREATER_THAN', state[key] ?? Date.now(), 50)).sort((a, b) => a.at - b.at);
    for (const d of docs) {
      await vault.append(logLine(kind, d), { date: d.date, heading: config.heading ?? 'Trinity' });
      state[key] = Math.max(state[key] ?? 0, d.at);
      changed = true;
    }
  }
  if (changed) await saveJson(STATE, state);
}

async function test() {
  const { config, user, vault } = await context();
  await user.token();
  console.log('Signed in to Trinity.');
  const top = await readdir(config.vaultPath);
  console.log(`Vault "${basename(config.vaultPath)}" is readable (${top.filter((n) => !n.startsWith('.')).length} items at the top level).`);
  console.log(`Today's daily note would be: ${vault.dailyPath(new Date().toISOString().slice(0, 10))}`);
  await heartbeat(user, config);
  console.log('Reported to Trinity. Settings in the app should now show your Mac as connected.');
}

async function run() {
  const { config, user, vault } = await context();
  const state = await loadJson(STATE, { lifeAt: Date.now(), checkinAt: Date.now() });
  log(`Trinity helper ${VERSION} running for vault "${basename(config.vaultPath)}"`);
  let lastBeat = 0;
  let lastMirror = 0;
  let backoff = 4000;
  for (;;) {
    try {
      if (Date.now() - lastBeat > 60_000) {
        await heartbeat(user, config);
        lastBeat = Date.now();
      }
      const n = await doJobs(user, vault);
      if (Date.now() - lastMirror > 30_000) {
        await mirror(user, vault, config, state);
        lastMirror = Date.now();
      }
      backoff = 4000;
      await sleep(n ? 300 : 4000);
    } catch (e) {
      log('problem:', e.message ?? e);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 5 * 60_000);
    }
  }
}

const cmd = process.argv[2] ?? 'run';
const commands = { setup, test, run };
if (!commands[cmd]) {
  console.error('Commands: setup, test, run');
  process.exit(1);
}
commands[cmd]().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

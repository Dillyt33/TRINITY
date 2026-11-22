// Run with: node --test bridge/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault, logLine } from './vault.mjs';
import { decode, decodeFields, encode } from './firestore.mjs';

async function makeVault() {
  const root = await mkdtemp(join(tmpdir(), 'vault-'));
  await mkdir(join(root, '.obsidian'));
  await mkdir(join(root, 'Projects'));
  await mkdir(join(root, 'Daily'));
  await writeFile(join(root, 'Projects', 'Album.md'), '# Album\nFinish the mix by March. Vocals need work.\n');
  await writeFile(join(root, 'Goals.md'), '# Goals\n- Gym 4x a week\n- Ship the album\n');
  await writeFile(join(root, '.obsidian', 'secret.md'), 'hidden album');
  return { root, vault: new Vault(root, { dailyFolder: 'Daily', dailyFormat: 'YYYY-MM-DD' }) };
}

test('search finds notes by content and name, skipping hidden folders', async () => {
  const { vault } = await makeVault();
  const r = await vault.search('album');
  assert.match(r, /Projects\/Album\.md/);
  assert.match(r, /Goals\.md/);
  assert.doesNotMatch(r, /secret/);
  assert.match(await vault.search('nothing-like-this'), /No notes mention/);
});

test('read, list and recent', async () => {
  const { vault } = await makeVault();
  assert.match(await vault.read('Projects/Album.md'), /Finish the mix/);
  const list = await vault.list('');
  assert.match(list, /- Daily\//);
  assert.match(list, /- Goals\.md/);
  assert.doesNotMatch(list, /\.obsidian/);
  assert.match(await vault.recent(1, 10), /Album\.md/);
});

test('refuses paths outside the vault or into hidden folders, including via symlinks', async () => {
  const { root, vault } = await makeVault();
  await assert.rejects(vault.read('../etc/passwd'), /Not allowed/);
  await assert.rejects(vault.read('.obsidian/secret.md'), /Not allowed/);
  const outside = await mkdtemp(join(tmpdir(), 'outside-'));
  await writeFile(join(outside, 'x.md'), 'private');
  await symlink(outside, join(root, 'Link'));
  await assert.rejects(vault.read('Link/x.md'), /Outside the vault/);
});

test('append puts lines under the Trinity heading of the daily note, creating it when needed', async () => {
  const { root, vault } = await makeVault();
  assert.equal(vault.dailyPath('2026-11-21'), 'Daily/2026-11-21.md');
  await vault.append('- 07:40 · Sleep · Slept 6h', { date: '2026-11-21' });
  await vault.append('- 13:05 · Check-in · Feeling rough', { date: '2026-11-21' });
  assert.equal(await readFile(join(root, 'Daily', '2026-11-21.md'), 'utf8'), '## Trinity\n- 07:40 · Sleep · Slept 6h\n- 13:05 · Check-in · Feeling rough\n');

  await writeFile(join(root, 'Daily', '2026-11-22.md'), '# Sunday\n\n## Trinity\n- first\n\n## Journal\nDear diary\n');
  await vault.append('- second', { date: '2026-11-22' });
  assert.equal(await readFile(join(root, 'Daily', '2026-11-22.md'), 'utf8'), '# Sunday\n\n## Trinity\n- first\n- second\n\n## Journal\nDear diary\n');

  await vault.append('- note', { path: 'Projects/Album', heading: 'Log' });
  assert.match(await readFile(join(root, 'Projects', 'Album.md'), 'utf8'), /## Log\n- note\n$/);
});

test('nested daily formats and creating notes without overwriting', async () => {
  const { root } = await makeVault();
  const v = new Vault(root, { dailyFolder: 'Journal', dailyFormat: 'YYYY/MM/YYYY-MM-DD' });
  assert.equal(v.dailyPath('2026-11-21'), 'Journal/2026/11/2026-11-21.md');
  assert.match(await v.run('write', { path: 'Ideas/New', content: 'hello' }), /Created Ideas\/New\.md/);
  await assert.rejects(v.run('write', { path: 'Ideas/New.md', content: 'again' }), /already exists/);
  assert.match(await v.run('write', { path: 'Ideas/New.md', content: 'again', overwrite: true }), /Saved/);
});

test('daily-note lines for life entries and check-ins', () => {
  const at = new Date(2026, 10, 21, 7, 42).getTime();
  assert.equal(logLine('life', { at, area: 'sleep', summary: 'Slept 6 hours' }), '- 07:42 · Sleep · Slept 6 hours');
  assert.equal(logLine('checkin', { at, kind: 'mood', mood: 'rough', note: 'slept badly' }), '- 07:42 · Check-in · Feeling rough — slept badly');
  assert.equal(logLine('checkin', { at, kind: 'block', blockTitle: 'Gym', outcome: 'done' }), '- 07:42 · Check-in · Gym: done');
});

test('Firestore value encoding round-trips', () => {
  const obj = { s: 'x', n: 3, f: 1.5, b: true, z: null, a: [1, 'y'], m: { k: 'v' } };
  assert.deepEqual(decodeFields(encode(obj).mapValue.fields), obj);
  assert.equal(decode({ integerValue: '42' }), 42);
});

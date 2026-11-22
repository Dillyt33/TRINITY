<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { THEMES, THEME_NAMES } from '../lib/themes';
  import { clockAp } from '../lib/time';
  import type { ThemeSetting } from '../lib/types';
  import { connectorUrl } from '../lib/connector';
  import ReminderSettings from './ReminderSettings.svelte';

  let profileDraft = $state(app.settings.profile ?? '');
  let profileTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const remote = app.settings.profile ?? '';
    if (document.activeElement?.id !== 'profile') profileDraft = remote;
  });

  async function copyConnector() {
    try {
      await navigator.clipboard.writeText(connectorUrl());
      app.flash('Copied the connector address');
    } catch {
      app.flash(connectorUrl());
    }
  }

  let importText = $state('');
  let showImport = $state(false);

  const themeOptions: { id: ThemeSetting; label: string; blurb: string; swatches: string[] }[] = [
    { id: 'auto', label: 'Auto', blurb: 'Paper by day, Midnight at night', swatches: [THEMES.Paper.bg, THEMES.Midnight.bg, THEMES.Paper.accent, THEMES.Midnight.accent] },
    ...THEME_NAMES.map((n) => ({ id: n as ThemeSetting, label: n, blurb: THEMES[n].blurb, swatches: [THEMES[n].bg, THEMES[n].surface, THEMES[n].text, THEMES[n].accent] })),
  ];

  const hourOptions = Array.from({ length: 25 }, (_, h) => h * 60);

  async function copyMarkdown() {
    const md = app.exportDay();
    try {
      await navigator.clipboard.writeText(md);
      app.flash('Copied the day as Markdown');
    } catch {
      importText = md;
      showImport = true;
      app.flash('Clipboard blocked: the Markdown is in the box below');
    }
  }

  async function doImport() {
    if (!importText.trim()) return;
    await app.importDay(importText);
    importText = '';
    showImport = false;
    app.settingsOpen = false;
  }
</script>

<div class="settings">
  <h2>Settings</h2>

  <section>
    <div class="label">Color scheme</div>
    <div class="themes" role="radiogroup" aria-label="Color scheme">
      {#each themeOptions as t (t.id)}
        <button class="theme" class:on={app.settings.theme === t.id} role="radio" aria-checked={app.settings.theme === t.id} onclick={() => app.setSettings({ theme: t.id })}>
          <span class="sw">{#each t.swatches as c, i (i)}<span style="background:{c}"></span>{/each}</span>
          <span class="tn">{t.label}</span>
          <span class="tb">{t.blurb}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="row2">
    <div>
      <div class="label">Week starts on</div>
      <div class="seg" role="radiogroup" aria-label="Week starts on">
        <button role="radio" aria-checked={app.settings.weekStart === 0} class:on={app.settings.weekStart === 0} onclick={() => app.setSettings({ weekStart: 0 })}>Sunday</button>
        <button role="radio" aria-checked={app.settings.weekStart === 1} class:on={app.settings.weekStart === 1} onclick={() => app.setSettings({ weekStart: 1 })}>Monday</button>
      </div>
    </div>
    <div>
      <div class="label">Hours shown</div>
      <div class="hours">
        <label class="sr-only" for="day-start">Day starts</label>
        <select id="day-start" class="field" value={app.settings.dayStart} onchange={(e) => app.setSettings({ dayStart: Math.min(Number(e.currentTarget.value), app.settings.dayEnd - 120) })}>
          {#each hourOptions.slice(0, 22) as m (m)}<option value={m}>{clockAp(m)}</option>{/each}
        </select>
        <span>to</span>
        <label class="sr-only" for="day-end">Day ends</label>
        <select id="day-end" class="field" value={app.settings.dayEnd} onchange={(e) => app.setSettings({ dayEnd: Math.max(Number(e.currentTarget.value), app.settings.dayStart + 120) })}>
          {#each hourOptions.slice(3) as m (m)}<option value={m}>{m === 1440 ? 'Midnight' : clockAp(m)}</option>{/each}
        </select>
      </div>
    </div>
  </section>

  <section>
    <div class="label">Talk to Trinity in Claude</div>
    {#if app.mode === 'firebase'}
      <div class="note ok">
        <Icon name="sparkle" size={16} />
        <span>Connect Claude once, and Trinity can read and change this calendar from the Claude app, including voice and “Hey Siri, Ask Claude”. In Claude: <strong>Settings → Connectors → Add custom connector</strong>, paste this address, then tap Connect and Allow.</span>
      </div>
      <div class="conn">
        <code>{connectorUrl()}</code>
        <button class="btn" onclick={copyConnector}><Icon name="copy" size={15} />Copy</button>
      </div>
    {:else}
      <div class="note"><Icon name="sparkle" size={16} /><span>Once Trinity is synced through Firebase and deployed (docs/SETUP.md), you can connect Claude here so Trinity can manage this calendar by voice.</span></div>
    {/if}
  </section>

  <ReminderSettings />

  <section>
    <label class="label" for="profile">About you (Trinity reads this)</label>
    <textarea
      id="profile"
      class="field profile"
      rows="6"
      bind:value={profileDraft}
      oninput={() => {
        clearTimeout(profileTimer);
        profileTimer = setTimeout(() => app.setSettings({ profile: profileDraft }), 500);
      }}
      placeholder={'Goals right now (and why they matter):\nWeekly targets (e.g. gym 4x, studio 3x):\nMy usual day (wake, work hours, best focus):\nNon-negotiables:\nWhat I tend to put off:\nHow hard to push me (1–5):'}
    ></textarea>
    <p class="hint">Trinity uses this in Claude and when she writes your check-ins.</p>
  </section>

  <section>
    <div class="label">Markdown</div>
    <div class="btns">
      <button class="btn" onclick={copyMarkdown}><Icon name="copy" size={15} />Copy this day</button>
      <button class="btn" onclick={() => (showImport = !showImport)}><Icon name="upload" size={15} />Import a day</button>
    </div>
    {#if showImport}
      <label class="sr-only" for="import-md">Markdown to import</label>
      <textarea id="import-md" class="field mono" rows="7" bind:value={importText} placeholder={'- [ ] 09:00-10:30 Deep work #deep\n- [ ] 12:00-13:00 Lunch #personal'}></textarea>
      <button class="btn primary" onclick={doImport} disabled={!importText.trim()}>Import</button>
    {/if}
  </section>

  <section>
    <div class="label">Account and sync</div>
    {#if app.mode === 'firebase' && app.user}
      <div class="acct">
        {#if app.user.photo}<img src={app.user.photo} alt="" referrerpolicy="no-referrer" />{:else}<span class="av"><Icon name="user" /></span>{/if}
        <div class="who">
          <strong>{app.user.name ?? 'Signed in'}</strong>
          <span>{app.user.email}</span>
        </div>
        <button class="btn" onclick={() => app.signOut()}><Icon name="logout" size={15} />Sign out</button>
      </div>
      <div class="note ok"><Icon name="cloud" size={16} /><span>Syncing between your devices.</span></div>
    {:else}
      <div class="note"><Icon name="cloud-off" size={16} /><span>Saved on this device only. Once Firebase is connected (see docs/SETUP.md), sign in with Google to sync your phone and Mac.</span></div>
      {#if app.mode === 'firebase'}<button class="btn primary" onclick={() => app.signIn()}>Sign in with Google</button>{/if}
    {/if}
  </section>

  <section>
    <button class="btn ghost" onclick={() => { app.loadSample(); app.settingsOpen = false; }}>Load a sample day</button>
  </section>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--sunken);
    text-align: left;
  }
  .theme.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .sw {
    display: flex;
    gap: 3px;
    width: 100%;
  }
  .sw span {
    flex: 1;
    height: 20px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25);
  }
  .tn {
    font-weight: 650;
  }
  .tb {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.3;
  }
  .row2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }
  .row2 > div {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .seg {
    display: flex;
    padding: 3px;
    gap: 2px;
    border-radius: 11px;
    background: var(--sunken);
  }
  .seg button {
    flex: 1;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font-weight: 550;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 650;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  .hours {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
  }
  .hours select {
    flex: 1;
  }
  .note {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--sunken);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .note :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .note.ok {
    color: var(--text);
  }
  .conn {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .conn code {
    flex: 1;
    min-width: 0;
    padding: 9px 11px;
    border-radius: 10px;
    background: var(--sunken);
    font-family: var(--mono);
    font-size: 12.5px;
    overflow-x: auto;
    white-space: nowrap;
  }
  .profile {
    resize: vertical;
    line-height: 1.5;
    font-size: 13.5px;
  }
  .hint {
    margin: -2px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mono {
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.5;
    resize: vertical;
  }
  .acct {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .acct img,
  .av {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--sunken);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .who span {
    font-size: 12.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

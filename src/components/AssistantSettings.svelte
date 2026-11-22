<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { chat } from '../lib/chat.svelte';
  import { canSpeak, loadVoicePrefs, saveVoicePrefs, speak, unlockSpeech, whenVoicesReady } from '../lib/voice';

  let prefs = $state(loadVoicePrefs());
  let voices = $state<SpeechSynthesisVoice[]>([]);
  let code = $state<string | null>(null);
  let settingUp = $state(false);
  let setupMsg = $state<string | null>(null);

  onMount(async () => {
    voices = await whenVoicesReady();
    chat.start();
    chat.refreshStatus();
  });

  function setPrefs(p: Partial<typeof prefs>) {
    prefs = { ...prefs, ...p };
    saveVoicePrefs(prefs);
  }

  function tryVoice() {
    unlockSpeech();
    speak('Hey, it’s Trinity. How are you doing today?', prefs);
  }

  async function doSetup() {
    settingUp = true;
    setupMsg = await chat.setup();
    settingUp = false;
    if (!setupMsg) app.flash('Trinity’s chat is ready');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      app.flash('Copied');
    } catch {
      app.flash('Select the text and copy it');
    }
  }

  const synced = $derived(app.mode === 'firebase' && !!app.user);
  const bridge = $derived(chat.status?.bridge ?? null);
  const lastSeen = $derived(bridge ? new Date(bridge.lastSeen).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const command = $derived(code ? `node trinity-bridge.mjs setup ${code} --vault "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/YOUR VAULT"` : '');
</script>

<section>
  <div class="label">Trinity’s chat & voice</div>
  {#if !synced}
    <div class="note"><Icon name="sparkle" size={16} /><span>Talking with Trinity needs the synced version of the app (docs/TRINITY-CHAT.md).</span></div>
  {:else if chat.status?.setUp}
    <div class="note ok">
      <Icon name="check" size={16} /><span><strong>Ready.</strong> Check-ins open a conversation, and you can talk to Trinity anytime from the Trinity tab.</span>
      <button class="btn ghost" disabled={settingUp} onclick={doSetup} title="Apply changes to Trinity’s instructions">{settingUp ? 'Updating…' : 'Update'}</button>
    </div>
  {:else}
    <div class="note">
      <Icon name="sparkle" size={16} />
      <span>{chat.status && !chat.status.apiKey ? 'Add your Anthropic API key to Trinity’s server first (docs/TRINITY-CHAT.md), then set up here.' : 'One tap creates Trinity’s chat on your Anthropic account.'}</span>
      <button class="btn primary" disabled={settingUp || !chat.status?.apiKey} onclick={doSetup}>{settingUp ? 'Setting up…' : 'Set up'}</button>
    </div>
    {#if setupMsg}<p class="err">{setupMsg}</p>{/if}
  {/if}

  {#if canSpeak()}
    <div class="row">
      <span class="grow">Read Trinity’s replies aloud</span>
      <input type="checkbox" checked={prefs.speak} onchange={(e) => setPrefs({ speak: e.currentTarget.checked })} aria-label="Read Trinity’s replies aloud" />
    </div>
    <div class="row">
      <label class="grow" for="voice-pick">Voice</label>
      <select id="voice-pick" class="field small" value={prefs.name ?? ''} onchange={(e) => setPrefs({ name: e.currentTarget.value || null })}>
        <option value="">Best available female voice</option>
        {#each voices as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
      </select>
      <button class="btn" onclick={tryVoice}>Try it</button>
    </div>
    <p class="hint">On iPhone, the most natural voices are free downloads: Settings → Accessibility → Spoken Content → Voices → English → Ava or Zoe (Premium/Enhanced).</p>
  {/if}
</section>

<section>
  <div class="label">Obsidian on your Mac</div>
  {#if !synced}
    <div class="note"><Icon name="cloud-off" size={16} /><span>Needs the synced version of the app.</span></div>
  {:else}
    <div class="note" class:ok={bridge?.connected}>
      <Icon name={bridge?.connected ? 'cloud' : 'cloud-off'} size={16} />
      <span>
        {#if bridge?.connected}<strong>Connected</strong> to “{bridge.vaultName}”. Trinity can search and read your notes and writes her log into your daily notes.
        {:else if bridge}Your Mac was last seen {lastSeen}. Notes Trinity writes are queued until it wakes up.
        {:else}Not connected. Trinity’s helper runs on your Mac and gives her access to your vault in iCloud Drive (docs/OBSIDIAN.md).{/if}
      </span>
    </div>
    <div class="btns">
      <button class="btn" onclick={() => (code = chat.macSetupCode())}><Icon name="copy" size={15} />Get the setup code</button>
      <button class="btn ghost" onclick={() => chat.refreshStatus()}>Refresh</button>
      {#if bridge}
        <button class="btn ghost danger" onclick={async () => { if (confirm('Disconnect your Mac and sign out of Trinity everywhere? You’ll sign in again, and the Mac will need a new setup code.')) await chat.signOutEverywhere(); }}>Disconnect Mac</button>
      {/if}
    </div>
    {#if code}
      <p class="hint">In Terminal on your Mac, inside the <code>trinity/bridge</code> folder, run this (put your vault’s real path in). Keep this code private: it lets the helper act as you in Trinity.</p>
      <div class="codebox"><code>{command}</code><button class="btn" onclick={() => copy(command)}><Icon name="copy" size={14} />Copy</button></div>
    {/if}
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--sunken);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .note span {
    flex: 1 1 200px;
  }
  .note.ok {
    color: var(--text);
  }
  .note :global(svg) {
    flex: none;
  }
  .err {
    margin: 0;
    color: var(--now);
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    border-bottom: 1px solid var(--line);
    font-size: 14px;
    flex-wrap: wrap;
  }
  .row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .grow {
    flex: 1;
  }
  .small {
    width: auto;
    max-width: 220px;
    padding: 6px 8px;
    font-size: 13px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.45;
  }
  .btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .codebox {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .codebox code {
    flex: 1;
    min-width: 0;
    padding: 10px;
    border-radius: 10px;
    background: var(--sunken);
    font-family: var(--mono);
    font-size: 11.5px;
    word-break: break-all;
    max-height: 120px;
    overflow: auto;
  }
</style>

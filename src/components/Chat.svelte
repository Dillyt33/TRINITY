<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { chat, type ChatMessage } from '../lib/chat.svelte';
  import { canListen, canSpeak, listen, loadVoicePrefs, saveVoicePrefs, speak, stopSpeaking, unlockSpeech } from '../lib/voice';

  let { compact = false }: { compact?: boolean } = $props();

  let text = $state('');
  let partial = $state('');
  let talking = $state(false); // hands-free voice loop on
  let listening = $state(false);
  let speaking = $state(false);
  let setupMsg = $state<string | null>(null);
  let settingUp = $state(false);
  let prefs = $state(loadVoicePrefs());
  let scroller: HTMLDivElement | undefined = $state();
  let input: HTMLTextAreaElement | undefined = $state();
  let stopListening: (() => void) | null = null;
  const spoken = new Set<string>();

  onMount(() => {
    chat.start();
  });
  onDestroy(() => {
    talking = false;
    stopListening?.();
    stopSpeaking();
  });

  // Keep the newest message in view.
  $effect(() => {
    void chat.messages.length;
    void chat.last?.text;
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
  });

  // Read out replies that finish while you're here (not old history).
  $effect(() => {
    for (const m of chat.messages) {
      if (m.role === 'trinity' && chat.freshIds.has(m.id) && !spoken.has(m.id) && prefs.speak && !talking) {
        spoken.add(m.id);
        say(m.text);
      }
    }
  });

  async function say(t: string) {
    if (!prefs.speak || !canSpeak()) return;
    speaking = true;
    await speak(t, prefs);
    speaking = false;
  }

  async function sendText(t: string) {
    if (!t.trim()) return;
    unlockSpeech();
    text = '';
    await chat.send(t);
  }

  /** Hands-free: Trinity speaks, you answer, she answers back… until you tap Stop. */
  async function startTalking() {
    unlockSpeech();
    if (!canListen()) {
      input?.focus();
      app.flash('Tap the microphone on your keyboard to talk');
      return;
    }
    talking = true;
    const last = chat.last;
    if (last?.role === 'trinity' && last.status === 'done' && !spoken.has(last.id)) {
      spoken.add(last.id);
      await say(last.text);
    }
    while (talking) {
      listening = true;
      partial = '';
      const l = listen((p) => (partial = p));
      stopListening = l.stop;
      const heard = await l.done;
      listening = false;
      stopListening = null;
      if (!talking) break;
      if (!heard) {
        talking = false;
        break;
      }
      partial = '';
      await chat.send(heard);
      const reply = await chat.waitForReply(heard);
      if (!reply || !talking) break;
      spoken.add(reply.id);
      if (reply.status === 'waiting') {
        await say(reply.text || 'Okay to go ahead?');
        talking = false; // answer with the buttons
        break;
      }
      await say(reply.text);
    }
    talking = false;
    listening = false;
  }

  function stopTalking() {
    talking = false;
    stopListening?.();
    stopSpeaking();
    speaking = false;
  }

  function toggleSpeak() {
    prefs = { ...prefs, speak: !prefs.speak };
    saveVoicePrefs(prefs);
    if (!prefs.speak) stopSpeaking();
  }

  async function doSetup() {
    settingUp = true;
    setupMsg = await chat.setup();
    settingUp = false;
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText(text);
    }
  }

  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const pending = (m: ChatMessage) => m.role === 'trinity' && m.status === 'streaming';
</script>

<div class="chat" class:compact>
  <header>
    <div class="who">
      <span class="avatar"><Icon name="sparkle" size={18} /></span>
      <div>
        <h2>Trinity</h2>
        <span class="sub">{speaking ? 'Speaking…' : listening ? 'Listening…' : chat.busy ? 'Thinking…' : chat.ready ? 'Here for you' : 'Not set up yet'}</span>
      </div>
    </div>
    <div class="acts">
      {#if canSpeak()}
        <button class="btn icon ghost" aria-label={prefs.speak ? 'Mute Trinity’s voice' : 'Read replies aloud'} aria-pressed={prefs.speak} onclick={toggleSpeak} title={prefs.speak ? 'Voice on' : 'Voice off'}>
          <Icon name={prefs.speak ? 'speaker' : 'speaker-off'} size={17} />
        </button>
      {/if}
      {#if chat.conversations.length}
        <label class="sr-only" for="conv-pick">Conversation</label>
        <select id="conv-pick" class="field pick" value={chat.currentId ?? ''} onchange={(e) => chat.open(e.currentTarget.value || null)}>
          <option value="">New conversation</option>
          {#each chat.conversations as c (c.id)}
            <option value={c.id}>{c.kind === 'checkin' ? 'Check-in' : c.title} · {new Date(c.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</option>
          {/each}
        </select>
      {/if}
      <button class="btn icon ghost" aria-label="New conversation" onclick={() => chat.newChat()}><Icon name="plus" size={16} /></button>
    </div>
  </header>

  <div class="body" bind:this={scroller}>
    {#if !chat.available}
      <div class="empty card">
        <strong>Trinity’s chat needs the synced version of the app.</strong>
        <span>Once Firebase is set up and you’re signed in (docs/SETUP.md), you can talk to Trinity here by voice or text.</span>
      </div>
    {:else if chat.status && !chat.status.setUp}
      <div class="empty card">
        <strong>Set up Trinity’s chat</strong>
        <span>Trinity will message you for check-ins, answer by voice, and use your calendar, life log and Obsidian notes. This uses your Anthropic API key on Trinity’s server.</span>
        {#if !chat.status.apiKey}
          <span class="warn">First add your Anthropic API key to the server (docs/TRINITY-CHAT.md, step 1).</span>
        {/if}
        <button class="btn primary" disabled={settingUp || !chat.status.apiKey} onclick={doSetup}>{settingUp ? 'Setting up…' : 'Set up'}</button>
        {#if setupMsg}<span class="warn">{setupMsg}</span>{/if}
      </div>
    {:else if chat.statusError && !chat.status}
      <div class="empty card"><span class="warn">{chat.statusError}</span></div>
    {:else if !chat.messages.length}
      <div class="hello">
        <span class="avatar big"><Icon name="sparkle" size={28} /></span>
        <p>Hey. How’s it going?</p>
        <span class="hint">Talk or type. Ask me to plan, move things, log how you slept or what you ate, or look something up in your notes.</span>
      </div>
    {/if}

    {#each chat.messages as m (m.id)}
      <div class="row {m.role}">
        <div class="bubble" class:streaming={pending(m)} class:error={m.status === 'error'}>
          {#if m.text}<span class="txt">{m.text}</span>{:else if pending(m)}<span class="dots"><i></i><i></i><i></i></span>{/if}
          {#if pending(m) && m.activity}<span class="activity">{m.activity}</span>{/if}
          {#if m.confirm && m.status === 'waiting'}
            <div class="confirm">
              <span>{m.confirm.summary}?</span>
              <div class="cbtns">
                <button class="btn" onclick={() => chat.confirm(m, false)}>No</button>
                <button class="btn primary" onclick={() => chat.confirm(m, true)}>Yes, do it</button>
              </div>
            </div>
          {/if}
        </div>
        <span class="time">{time(m.at)}</span>
      </div>
    {/each}
    {#if listening && partial}
      <div class="row me"><div class="bubble live"><span class="txt">{partial}</span></div></div>
    {/if}
  </div>

  {#if chat.ready}
    <footer>
      {#if talking}
        <button class="talk on" onclick={stopTalking} aria-label="Stop talking">
          <span class="pulse-ring"></span><Icon name="x" size={22} stroke={2} />
        </button>
        <span class="talking-label">{speaking ? 'Trinity is talking…' : listening ? 'Listening… just talk' : 'Thinking…'}</span>
      {:else}
        <button class="talk" onclick={startTalking} aria-label="Talk to Trinity"><Icon name="mic" size={22} /></button>
        <label class="sr-only" for="chat-input">Message Trinity</label>
        <textarea id="chat-input" bind:this={input} bind:value={text} rows="1" placeholder="Message Trinity" onkeydown={key}></textarea>
        <button class="btn primary send" disabled={!text.trim() || chat.sending} onclick={() => sendText(text)} aria-label="Send"><Icon name="arrow-right" size={16} /></button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .compact header {
    padding-top: calc(var(--safe-top) + 10px);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 19px;
    background: var(--accent-soft);
    color: var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .avatar.big {
    width: 64px;
    height: 64px;
    border-radius: 32px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  .sub {
    font-size: 12.5px;
    color: var(--muted);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pick {
    width: auto;
    max-width: 170px;
    padding: 6px 8px;
    font-size: 12.5px;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .compact .body {
    padding-bottom: calc(150px + var(--safe-bottom));
  }
  .empty {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
  }
  .empty strong {
    color: var(--text);
    font-size: 15px;
  }
  .empty .btn {
    align-self: flex-start;
  }
  .warn {
    color: var(--now);
  }
  .hello {
    margin: auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    padding: 30px 20px;
  }
  .hello p {
    margin: 0;
    font-size: 20px;
    font-weight: 650;
  }
  .hint {
    color: var(--muted);
    font-size: 13.5px;
    max-width: 340px;
    line-height: 1.5;
  }
  .row {
    display: flex;
    flex-direction: column;
    max-width: 82%;
  }
  .row.trinity {
    align-self: flex-start;
  }
  .row.me {
    align-self: flex-end;
    align-items: flex-end;
  }
  .bubble {
    padding: 10px 13px;
    border-radius: 18px;
    font-size: 15px;
    line-height: 1.42;
    word-break: break-word;
  }
  .txt {
    white-space: pre-wrap;
  }
  .trinity .bubble {
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom-left-radius: 6px;
  }
  .me .bubble {
    background: var(--accent);
    color: var(--accent-text);
    border-bottom-right-radius: 6px;
  }
  .bubble.live {
    opacity: 0.6;
  }
  .bubble.error {
    color: var(--muted);
  }
  .activity {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .time {
    font-size: 10.5px;
    color: var(--faint);
    margin: 2px 6px 4px;
  }
  .dots {
    display: inline-flex;
    gap: 4px;
    padding: 4px 0;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  .confirm {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13.5px;
  }
  .cbtns {
    display: flex;
    gap: 6px;
  }
  .cbtns .btn {
    height: 36px;
  }
  footer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--line);
    background: var(--surface);
  }
  .compact footer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(76px + var(--safe-bottom));
  }
  textarea {
    flex: 1;
    min-width: 0;
    resize: none;
    max-height: 120px;
    border: 1px solid var(--line);
    background: var(--sunken);
    border-radius: 20px;
    padding: 10px 14px;
    font-size: 15px;
    outline: none;
  }
  textarea:focus {
    border-color: var(--accent);
  }
  .send {
    width: 42px;
    height: 42px;
    padding: 0;
    border-radius: 21px;
  }
  .talk {
    position: relative;
    width: 46px;
    height: 46px;
    border-radius: 23px;
    border: none;
    background: var(--accent);
    color: var(--accent-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .talk.on {
    width: 58px;
    height: 58px;
    border-radius: 29px;
    background: var(--now);
    color: #fff;
  }
  .pulse-ring {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 2px solid var(--now);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .talking-label {
    align-self: center;
    color: var(--muted);
    font-size: 14px;
  }
</style>

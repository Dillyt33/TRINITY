<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { parseQuickAdd } from '../lib/parse';
  import { duration, shortDate, timeRange } from '../lib/time';
  import { CATEGORY_NAMES } from '../lib/types';

  let { autofocus = false, big = false, ondone }: { autofocus?: boolean; big?: boolean; ondone?: () => void } = $props();

  let text = $state('');
  let input: HTMLInputElement | undefined = $state();
  let listening = $state(false);

  const parsed = $derived(parseQuickAdd(text, app.date));
  const when = $derived.by(() => {
    if (!parsed) return '';
    const day = parsed.date === app.today ? 'Today' : parsed.date === app.date ? shortDate(parsed.date) : shortDate(parsed.date);
    if (parsed.start === null) return `Unscheduled · ~${duration(parsed.duration === 60 ? 30 : parsed.duration)}`;
    return `${day} · ${timeRange(parsed.start, parsed.start + parsed.duration)}`;
  });

  type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };
  const SpeechRec = typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
       (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)
    : undefined;
  let rec: Recognition | null = null;

  function listen() {
    if (!SpeechRec) return;
    if (listening) {
      rec?.stop();
      return;
    }
    rec = new SpeechRec();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => {
      text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
    };
    rec.onend = () => (listening = false);
    listening = true;
    rec.start();
  }

  async function submit() {
    if (!parsed) return;
    await app.quickAdd(parsed);
    text = '';
    ondone?.();
  }

  export function focus() {
    input?.focus();
  }

  onMount(() => {
    if (autofocus) setTimeout(() => input?.focus(), 60);
  });
</script>

<form class="qa" class:big onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <div class="box" class:active={!!text}>
    <span class="spark"><Icon name="sparkle" size={15} /></span>
    <label class="sr-only" for="quick-add{big ? '-big' : ''}">Add a block</label>
    <input
      id="quick-add{big ? '-big' : ''}"
      bind:this={input}
      bind:value={text}
      placeholder={big ? 'Gym tomorrow 6pm 1h #health' : 'Add…  “Gym 6pm 1h #health”'}
      autocomplete="off"
      enterkeyhint="done"
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          text = '';
          input?.blur();
          ondone?.();
        }
      }}
    />
    {#if !big}<kbd>⌘K</kbd>{/if}
    {#if SpeechRec}
      <button type="button" class="mic" class:on={listening} aria-label={listening ? 'Stop listening' : 'Speak'} onclick={listen}><Icon name="mic" size={15} /></button>
    {/if}
    <button class="btn primary add" type="submit" disabled={!parsed}>Add</button>
  </div>
  {#if parsed}
    <div class="preview fade-up" role="status">
      <span class="dot" style="background: var(--c-{parsed.cat}-dot)"></span>
      <strong>{parsed.title}</strong>
      <span class="when tabular">{when}</span>
      <span class="cat">{CATEGORY_NAMES[parsed.cat]}</span>
    </div>
  {/if}
</form>

<style>
  .qa {
    position: relative;
    width: 100%;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 5px 0 12px;
    border-radius: 11px;
    border: 1px solid var(--line);
    background: var(--sunken);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .box:focus-within,
  .box.active {
    border-color: var(--accent);
  }
  .big .box {
    height: 52px;
    border-radius: 15px;
    font-size: 16px;
  }
  .spark {
    color: var(--accent);
    display: inline-flex;
  }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
  }
  .big input {
    font-size: 16px;
  }
  kbd {
    font-family: inherit;
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 2px 6px;
  }
  .mic {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .mic.on {
    color: var(--now);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .add {
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 13px;
  }
  .big .add {
    height: 40px;
    border-radius: 11px;
    padding: 0 16px;
  }
  .add:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .preview {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 11px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    font-size: 13px;
    flex-wrap: wrap;
  }
  .big .preview {
    position: static;
    margin-top: 10px;
    box-shadow: none;
  }
  .when {
    color: var(--muted);
  }
  .cat {
    margin-left: auto;
    color: var(--faint);
    font-size: 12px;
  }
</style>

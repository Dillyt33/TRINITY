<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { findFreeSlot } from '../lib/layout';
  import { addDays, timeRange } from '../lib/time';
  import { MOOD_LABELS, type CheckIn, type Mood } from '../lib/types';

  let { kind, id, moment, onclose }: { kind: 'block' | 'mood'; id?: string; moment?: CheckIn['moment']; onclose: () => void } = $props();

  let note = $state('');
  let mood = $state<Mood | null>(null);
  let missed = $state(false);
  let busy = $state(false);

  const block = $derived(id ? app.blocks.find((b) => b.id === id) ?? null : null);
  const todays = $derived(app.blocks.filter((b) => b.date === app.today && b.cat !== 'break'));
  const doneCount = $derived(todays.filter((b) => b.done).length);
  const next = $derived(todays.filter((b) => !b.done && b.start > app.now).sort((a, b) => a.start - b.start)[0]);

  const heading = $derived(
    moment === 'morning' ? 'Good morning. How are you feeling?' : moment === 'evening' ? 'How was today?' : 'How are you doing?',
  );

  async function blockOutcome(outcome: NonNullable<CheckIn['outcome']>) {
    if (!block || busy) return;
    busy = true;
    const b = block;
    if (outcome === 'done') await app.updateBlock(b.id, { done: true });
    if (outcome === 'more') await app.updateBlock(b.id, { end: Math.max(b.end, app.now) + 15 });
    await app.saveCheckin({ kind: 'block', blockId: b.id, blockTitle: b.title, outcome, ...(note.trim() ? { note: note.trim() } : {}) });
    busy = false;
    onclose();
    app.flash(outcome === 'done' ? `Nice. “${b.title}” is done.` : outcome === 'more' ? `Extended “${b.title}” by 15 minutes.` : 'Logged.');
  }

  async function moveLater() {
    if (!block) return;
    const len = block.end - block.start;
    const others = app.blocks.filter((b) => b.date === app.today && b.id !== block.id);
    const at = findFreeSlot(others, len, app.now, app.settings.dayStart, app.settings.dayEnd, app.settings.snap);
    if (at === null) {
      app.flash('No free slot left today. Try tomorrow.');
      return;
    }
    await app.updateBlock(block.id, { date: app.today, start: at, end: at + len });
    await app.saveCheckin({ kind: 'block', blockId: block.id, blockTitle: block.title, outcome: 'moved', ...(note.trim() ? { note: note.trim() } : {}) });
    onclose();
    app.flash(`Moved “${block.title}” to ${timeRange(at, at + len)}.`);
  }

  async function moveTomorrow() {
    if (!block) return;
    await app.saveCheckin({ kind: 'block', blockId: block.id, blockTitle: block.title, outcome: 'moved', ...(note.trim() ? { note: note.trim() } : {}) });
    await app.moveToDate(block.id, addDays(app.today, 1));
    onclose();
  }

  async function drop() {
    if (!block) return;
    await app.saveCheckin({ kind: 'block', blockId: block.id, blockTitle: block.title, outcome: 'dropped', ...(note.trim() ? { note: note.trim() } : {}) });
    await app.deleteBlock(block.id);
    onclose();
  }

  async function saveMood() {
    if (!mood || busy) return;
    busy = true;
    await app.saveCheckin({ kind: 'mood', moment: moment ?? 'anytime', mood, ...(note.trim() ? { note: note.trim() } : {}) });
    busy = false;
    onclose();
    app.flash(mood === 'rough' || mood === 'meh' ? 'Got it. Go easy on yourself today.' : 'Thanks. Trinity will keep that in mind.');
  }
</script>

<div class="ci">
  <div class="label">Check-in</div>

  {#if kind === 'block'}
    {#if !block}
      <h2>That block isn’t on your calendar anymore.</h2>
      <button class="btn" onclick={onclose}>Close</button>
    {:else}
      <h2>How did “{block.title}” go?</h2>
      <p class="sub tabular">{timeRange(block.start, block.end)}{block.subtasks.length ? ` · ${block.subtasks.filter((s) => s.done).length} of ${block.subtasks.length} steps` : ''}</p>
      {#if !missed}
        <div class="grid">
          <button class="btn primary big" disabled={busy} onclick={() => blockOutcome('done')}><Icon name="check" size={16} stroke={2.2} />Done</button>
          <button class="btn big" disabled={busy} onclick={() => blockOutcome('more')}>Need 15 more min</button>
          <button class="btn big wide" disabled={busy} onclick={() => (missed = true)}>Didn’t happen</button>
        </div>
      {:else}
        <p class="sub">No problem. What should happen to it?</p>
        <div class="grid">
          <button class="btn big" onclick={moveLater}>Later today</button>
          <button class="btn big" onclick={moveTomorrow}>Tomorrow</button>
          <button class="btn big wide danger" onclick={drop}>Drop it</button>
        </div>
      {/if}
    {/if}
  {:else}
    <h2>{heading}</h2>
    <p class="sub">
      {#if todays.length}{doneCount} of {todays.length} done today.{next ? ` Next: ${next.title}.` : ''}{:else}Nothing planned today yet.{/if}
    </p>
    <div class="moods" role="radiogroup" aria-label="How you feel">
      {#each Object.entries(MOOD_LABELS) as [m, label] (m)}
        <button class="mood m-{m}" class:on={mood === m} role="radio" aria-checked={mood === m} onclick={() => (mood = m as Mood)}>{label}</button>
      {/each}
    </div>
  {/if}

  {#if kind === 'mood' || block}
    <label class="sr-only" for="ci-note">Note</label>
    <textarea id="ci-note" class="field" rows="2" bind:value={note} placeholder="Anything Trinity should know? (optional)"></textarea>
  {/if}

  {#if kind === 'mood'}
    <button class="btn primary big full" disabled={!mood || busy} onclick={saveMood}>Save</button>
  {/if}

  <a class="claude" href="claude://">
    <Icon name="sparkle" size={14} />Talk it through with Trinity in Claude
  </a>
</div>

<style>
  .ci {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 6px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .sub {
    margin: -4px 0 0;
    color: var(--muted);
    font-size: 13.5px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .big {
    height: 48px;
    border-radius: 14px;
    font-size: 15px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .full {
    width: 100%;
  }
  .moods {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .mood {
    height: 52px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--sunken);
    font-weight: 650;
    font-size: 14px;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  }
  .mood:active {
    transform: scale(0.96);
  }
  .mood.on {
    border-color: transparent;
    background: var(--accent);
    color: var(--accent-text);
  }
  textarea {
    resize: none;
    font-size: 14px;
  }
  .claude {
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    text-decoration: none;
    padding: 6px 10px;
  }
  .claude :global(svg) {
    color: #d97757;
  }
</style>

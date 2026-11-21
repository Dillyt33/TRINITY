<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { uid } from '../lib/id';
  import { addDays, duration, hhmm, timeRange } from '../lib/time';
  import { CATEGORY_IDS, CATEGORY_NAMES, type Block } from '../lib/types';

  let { block, onclose }: { block: Block; onclose?: () => void } = $props();

  let titleEl: HTMLInputElement | undefined = $state();
  let newStep = $state('');
  let titleDraft = $state('');
  let notesDraft = $state('');
  let lastId = '';
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  // Load drafts when another block is selected (not on every remote update, so typing isn't interrupted).
  $effect(() => {
    if (block.id !== lastId) {
      lastId = block.id;
      titleDraft = block.title;
      notesDraft = block.notes;
      if (app.focusTitleId === block.id) {
        app.focusTitleId = null;
        tick().then(() => titleEl?.select());
      }
    }
  });

  function saveSoon(patch: Partial<Block>) {
    clearTimeout(saveTimer);
    const id = block.id;
    saveTimer = setTimeout(() => app.updateBlock(id, patch), 350);
  }

  const len = $derived(block.end - block.start);
  const isToday = $derived(block.date === app.today);
  const live = $derived(isToday && !block.done && block.start <= app.now && app.now < block.end);
  const status = $derived.by(() => {
    if (block.done) return { label: 'Completed', right: duration(len), pct: 100 };
    if (live) return { label: 'In progress', right: `${block.end - app.now} min left`, pct: ((app.now - block.start) / len) * 100 };
    if (block.date > app.today || (isToday && block.start > app.now)) {
      const right = isToday ? `starts in ${duration(block.start - app.now)}` : 'upcoming';
      return { label: 'Up next', right, pct: 0 };
    }
    return { label: 'Missed', right: 'move it or mark it done', pct: 0 };
  });
  const doneSteps = $derived(block.subtasks.filter((s) => s.done).length);

  function setTime(which: 'start' | 'end', value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    const [h, m] = value.split(':').map(Number);
    const min = h * 60 + m;
    if (which === 'start') app.updateBlock(block.id, { start: min, end: min + len });
    else app.updateBlock(block.id, { end: Math.max(block.start + 5, min) });
  }

  function addStep() {
    const text = newStep.trim();
    if (!text) return;
    app.updateBlock(block.id, { subtasks: [...block.subtasks, { id: uid('s'), text, done: false }] });
    newStep = '';
  }

  function toggleStep(id: string) {
    app.updateBlock(block.id, { subtasks: block.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  }

  function removeStep(id: string) {
    app.updateBlock(block.id, { subtasks: block.subtasks.filter((s) => s.id !== id) });
  }
</script>

<div class="detail fade-up">
  <div class="top">
    <div class="cats" role="radiogroup" aria-label="Category">
      {#each CATEGORY_IDS as c (c)}
        <button
          class="catbtn cat-{c}"
          class:on={block.cat === c}
          role="radio"
          aria-checked={block.cat === c}
          onclick={() => app.updateBlock(block.id, { cat: c })}
        >
          <span class="dot"></span>{CATEGORY_NAMES[c]}
        </button>
      {/each}
    </div>
    {#if onclose}
      <button class="btn icon ghost" aria-label="Close details" onclick={onclose}><Icon name="x" /></button>
    {/if}
  </div>

  {#if block.source === 'claude' || block.source === 'coach'}
    <span class="chip src"><Icon name="sparkle" size={11} /> Added by {block.source === 'coach' ? 'your coach' : 'Claude'}</span>
  {/if}

  <label class="sr-only" for="title-{block.id}">Title</label>
  <input
    id="title-{block.id}"
    class="title"
    bind:this={titleEl}
    bind:value={titleDraft}
    oninput={() => saveSoon({ title: titleDraft.trim() || 'Untitled' })}
    onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    placeholder="What are you doing?"
  />

  <div class="times">
    <Icon name="clock" size={15} />
    <label class="sr-only" for="start-{block.id}">Start</label>
    <input id="start-{block.id}" type="time" step="300" value={hhmm(block.start)} onchange={(e) => setTime('start', e.currentTarget.value)} />
    <span class="dash">–</span>
    <label class="sr-only" for="end-{block.id}">End</label>
    <input id="end-{block.id}" type="time" step="300" value={hhmm(block.end)} onchange={(e) => setTime('end', e.currentTarget.value)} />
    <span class="len tabular">{duration(len)}</span>
  </div>

  <div class="status">
    <div class="srow">
      <strong>{status.label}</strong>
      <span class="tabular">{status.right}</span>
    </div>
    <div class="bar"><span class="cat-{block.cat}" style="width:{status.pct}%"></span></div>
  </div>

  <section>
    <div class="label">Checklist{block.subtasks.length ? ` · ${doneSteps}/${block.subtasks.length}` : ''}</div>
    <ul class="steps">
      {#each block.subtasks as s (s.id)}
        <li>
          <label>
            <input type="checkbox" checked={s.done} onchange={() => toggleStep(s.id)} />
            <span class:struck={s.done}>{s.text}</span>
          </label>
          <button class="rm" aria-label="Remove {s.text}" onclick={() => removeStep(s.id)}><Icon name="x" size={12} /></button>
        </li>
      {/each}
    </ul>
    <form class="addstep" onsubmit={(e) => { e.preventDefault(); addStep(); }}>
      <Icon name="plus" size={14} />
      <label class="sr-only" for="step-{block.id}">Add a step</label>
      <input id="step-{block.id}" bind:value={newStep} placeholder="Add a step" />
    </form>
  </section>

  <section>
    <label class="label" for="notes-{block.id}">Notes</label>
    <textarea
      id="notes-{block.id}"
      class="notes"
      rows="3"
      bind:value={notesDraft}
      oninput={() => saveSoon({ notes: notesDraft })}
      placeholder="Links, context, what done looks like…"
    ></textarea>
  </section>

  <div class="actions">
    <button class="btn primary" onclick={() => app.toggleDone(block.id)}>
      <Icon name="check" size={15} stroke={2.2} />{block.done ? 'Not done' : 'Mark done'}
    </button>
    <button class="btn" onclick={() => app.extend(block.id, 15)}>+15 min</button>
    <button class="btn" onclick={() => app.moveToDate(block.id, addDays(block.date, 1))}>Tomorrow <Icon name="arrow-right" size={14} /></button>
    <button class="btn danger" onclick={() => app.deleteBlock(block.id)}><Icon name="trash" size={15} />Delete</button>
  </div>

  <div class="foot tabular">{timeRange(block.start, block.end)} · {block.date}</div>
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
  }
  .catbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: transparent;
    font-size: 12px;
    font-weight: 550;
    color: var(--muted);
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .catbtn .dot {
    width: 7px;
    height: 7px;
    background: var(--d);
  }
  .catbtn.on {
    background: var(--b);
    color: var(--f);
    border-color: transparent;
    font-weight: 650;
  }
  .cat-deep { --b: var(--c-deep-bg); --f: var(--c-deep-fg); --d: var(--c-deep-dot); }
  .cat-meet { --b: var(--c-meet-bg); --f: var(--c-meet-fg); --d: var(--c-meet-dot); }
  .cat-health { --b: var(--c-health-bg); --f: var(--c-health-fg); --d: var(--c-health-dot); }
  .cat-personal { --b: var(--c-personal-bg); --f: var(--c-personal-fg); --d: var(--c-personal-dot); }
  .cat-admin { --b: var(--c-admin-bg); --f: var(--c-admin-fg); --d: var(--c-admin-dot); }
  .cat-break { --b: var(--c-break-bg); --f: var(--c-break-fg); --d: var(--c-break-dot); }
  .src {
    align-self: flex-start;
    background: var(--sunken);
    font-weight: 550;
  }
  .src :global(svg) {
    color: var(--accent);
  }
  .title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    border: none;
    background: transparent;
    outline: none;
    padding: 2px 0;
    width: 100%;
    border-bottom: 1px solid transparent;
  }
  .title:focus {
    border-bottom-color: var(--line);
  }
  .times {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    margin-top: -8px;
    flex-wrap: wrap;
  }
  .times input {
    border: 1px solid var(--line);
    background: var(--sunken);
    border-radius: 8px;
    padding: 5px 8px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    min-width: 0;
  }
  .times .len {
    margin-left: 4px;
    font-size: 13px;
  }
  .status {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--sunken);
  }
  .srow {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    gap: 8px;
  }
  .srow span {
    color: var(--muted);
  }
  .bar {
    margin-top: 10px;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--d);
    border-radius: 3px;
    transition: width 0.3s var(--ease);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .steps li {
    display: flex;
    align-items: center;
    border-radius: 8px;
  }
  .steps li:hover {
    background: var(--sunken);
  }
  .steps label {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    cursor: pointer;
    font-size: 13.5px;
    min-height: 36px;
  }
  .steps input {
    width: 17px;
    height: 17px;
    margin: 0;
    accent-color: var(--accent);
  }
  .struck {
    text-decoration: line-through;
    color: var(--muted);
  }
  .rm {
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    color: var(--faint);
    border-radius: 8px;
    opacity: 0;
  }
  .steps li:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  @media (hover: none) {
    .rm {
      opacity: 0.7;
    }
  }
  .addstep {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    color: var(--faint);
  }
  .addstep input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    padding: 6px 0;
    font-size: 13.5px;
  }
  .notes {
    resize: vertical;
    border: 1px solid var(--line);
    background: var(--sunken);
    border-radius: 10px;
    padding: 10px 12px;
    outline: none;
    line-height: 1.5;
    font-size: 13.5px;
    min-height: 70px;
  }
  .notes:focus {
    border-color: var(--accent);
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .foot {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }
</style>

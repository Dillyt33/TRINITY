<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { addMonths, duration, firstOfMonth, monthGrid, monthTitle, weekdayLetters } from '../lib/time';
  import { CATEGORY_NAMES, type CategoryId } from '../lib/types';

  let { inboxOnly = false }: { inboxOnly?: boolean } = $props();
  let newTask = $state('');
  let intentionDraft = $state('');
  let intentionFor = '';
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (intentionFor !== app.date) {
      intentionFor = app.date;
      intentionDraft = app.intention;
    }
  });
  $effect(() => {
    // Pick up the intention when it arrives from sync, unless the person is typing.
    const remote = app.intention;
    if (document.activeElement?.id !== 'intention') intentionDraft = remote;
  });

  let calMonth = $state(firstOfMonth(app.date));
  $effect(() => {
    calMonth = firstOfMonth(app.date);
  });
  const cells = $derived(monthGrid(calMonth, app.settings.weekStart));
  const busyDays = $derived(new Set(app.blocks.map((b) => b.date)));

  const breakdown = $derived.by(() => {
    const mins: Partial<Record<CategoryId, number>> = {};
    for (const b of app.dayBlocks) if (b.cat !== 'break') mins[b.cat] = (mins[b.cat] ?? 0) + (b.end - b.start);
    return (Object.entries(mins) as [CategoryId, number][]).sort((a, b) => b[1] - a[1]);
  });

  function addTask(e: SubmitEvent) {
    e.preventDefault();
    const t = newTask.trim();
    if (!t) return;
    const est = t.match(/~?(\d+)\s*m(in)?\b/i);
    app.addTask(est ? t.replace(est[0], '').trim() : t, est ? Number(est[1]) : 30);
    newTask = '';
  }
</script>

<aside class="side">
  {#if !inboxOnly}
  <section class="card cal" aria-label="Month">
    <div class="calhead">
      <button class="btn icon ghost" aria-label="Previous month" onclick={() => (calMonth = addMonths(calMonth, -1))}><Icon name="chevron-left" /></button>
      <span class="mt">{monthTitle(calMonth)}</span>
      <button class="btn icon ghost" aria-label="Next month" onclick={() => (calMonth = addMonths(calMonth, 1))}><Icon name="chevron-right" /></button>
    </div>
    <div class="wk">
      {#each weekdayLetters(app.settings.weekStart) as l, i (i)}<span>{l}</span>{/each}
    </div>
    <div class="days">
      {#each cells as c (c.date)}
        <button
          class="d tabular"
          class:out={!c.inMonth}
          class:today={c.date === app.today}
          class:sel={c.date === app.date}
          class:past={c.date < app.today}
          onclick={() => app.goTo(c.date, 'day')}
          aria-label={c.date}
        >
          {c.day}
          <span class="bd" class:on={busyDays.has(c.date)}></span>
        </button>
      {/each}
    </div>
  </section>
  {/if}

  <section class="intent">
    <label class="label ink" for="intention">Intention</label>
    <textarea
      id="intention"
      rows="2"
      bind:value={intentionDraft}
      placeholder="The one thing that would make today a win…"
      oninput={() => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => app.setIntention(intentionDraft.trim()), 400);
      }}
    ></textarea>
  </section>

  <section class="card list" aria-label="Unscheduled">
    <div class="lh">
      <span class="lt">Unscheduled</span>
      <span class="hint">drag onto the day</span>
    </div>
    <ul>
      {#each app.openTasks as t (t.id)}
        <li
          class="task fade-up"
          draggable="true"
          ondragstart={(e) => {
            e.dataTransfer?.setData('text/trinity-task', t.id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          }}
        >
          <span class="grip"><Icon name="grip" size={14} /></span>
          <span class="dot" style="background: var(--c-{t.cat}-dot)"></span>
          <span class="tt">{t.title}</span>
          <span class="est tabular">{duration(t.estimate)}</span>
          <button class="mini" title="Schedule in the next free slot" aria-label="Schedule {t.title}" onclick={() => app.scheduleTask(t.id)}><Icon name="arrow-right" size={13} /></button>
          <button class="mini" title="Mark done" aria-label="Mark {t.title} done" onclick={() => app.toggleTask(t.id)}><Icon name="check" size={13} /></button>
        </li>
      {/each}
    </ul>
    <form class="addt" onsubmit={addTask}>
      <Icon name="plus" size={14} />
      <label class="sr-only" for="new-task">Add to Unscheduled</label>
      <input id="new-task" bind:value={newTask} placeholder="Add a to-do (e.g. call bank ~15m)" />
    </form>
  </section>

  {#if breakdown.length && !inboxOnly}
    <section class="card mix" aria-label="Where the time goes">
      <div class="lt">Where the time goes</div>
      <div class="stack">
        {#each breakdown as [c, m] (c)}<span style="flex:{m} 1 0; background: var(--c-{c}-dot)"></span>{/each}
      </div>
      {#each breakdown as [c, m] (c)}
        <div class="mrow"><span class="sq" style="background: var(--c-{c}-dot)"></span><span>{CATEGORY_NAMES[c]}</span><span class="tabular">{duration(m)}</span></div>
      {/each}
    </section>
  {/if}
</aside>

<style>
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .cal {
    padding: 12px 12px 10px;
  }
  .calhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .mt {
    font-weight: 650;
  }
  .wk,
  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
    text-align: center;
  }
  .wk {
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .d {
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-size: 12.5px;
    font-weight: 550;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--text);
  }
  .d:hover {
    background: var(--sunken);
  }
  .d.past {
    color: var(--muted);
  }
  .d.out {
    color: var(--faint);
    opacity: 0.6;
  }
  .d.sel {
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }
  .d.today {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 750;
  }
  .bd {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }
  .bd.on {
    background: var(--faint);
  }
  .today .bd.on {
    background: var(--accent-text);
  }
  .intent {
    background: var(--accent-soft);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ink {
    color: var(--accent-ink);
  }
  .intent textarea {
    border: none;
    background: transparent;
    outline: none;
    resize: none;
    font-size: 15px;
    font-weight: 620;
    line-height: 1.35;
    padding: 0;
  }
  .intent textarea::placeholder {
    color: var(--muted);
    font-weight: 500;
  }
  .list {
    padding: 12px 14px;
  }
  .lh {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .lt {
    font-weight: 650;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .task {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 8px;
    border-radius: 10px;
    background: var(--sunken);
    cursor: grab;
  }
  .grip {
    color: var(--faint);
    display: inline-flex;
  }
  .tt {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .est {
    font-size: 11px;
    color: var(--muted);
  }
  .mini {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .mini:hover {
    background: var(--surface);
    color: var(--text);
  }
  .addt {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--faint);
    padding: 8px 2px 0;
  }
  .addt input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 13px;
    padding: 4px 0;
    min-width: 0;
  }
  .mix {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .stack {
    display: flex;
    gap: 2px;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    margin: 4px 0 4px;
  }
  .mrow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .mrow span:nth-child(2) {
    flex: 1;
  }
  .mrow span:last-child {
    color: var(--muted);
  }
  .sq {
    width: 8px;
    height: 8px;
    border-radius: 3px;
  }
</style>

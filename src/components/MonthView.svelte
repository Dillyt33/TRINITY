<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { clock, duration, longDate, monthGrid, weekdayShort, weekdayLetters } from '../lib/time';
  import { CATEGORY_NAMES, type Block, type CategoryId } from '../lib/types';

  let { compact = false }: { compact?: boolean } = $props();

  let sel = $state(app.date);
  $effect(() => {
    sel = app.date;
  });

  const cells = $derived(monthGrid(app.date, app.settings.weekStart));
  const byDate = $derived.by(() => {
    const m = new Map<string, Block[]>();
    for (const b of app.blocks) {
      const list = m.get(b.date) ?? [];
      list.push(b);
      m.set(b.date, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.start - b.start);
    return m;
  });

  const RIBBON_START = 6 * 60;
  const RIBBON_LEN = 17 * 60;

  function stats(date: string) {
    const list = (byDate.get(date) ?? []).filter((b) => b.cat !== 'break');
    const mins = list.reduce((a, b) => a + b.end - b.start, 0);
    const done = list.filter((b) => b.done).length;
    return { list, mins, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  }

  const selBlocks = $derived(byDate.get(sel) ?? []);
  const monthTotals = $derived.by(() => {
    const mins: Partial<Record<CategoryId, number>> = {};
    for (const c of cells) {
      if (!c.inMonth) continue;
      for (const b of byDate.get(c.date) ?? []) if (b.cat !== 'break') mins[b.cat] = (mins[b.cat] ?? 0) + b.end - b.start;
    }
    const entries = (Object.entries(mins) as [CategoryId, number][]).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return entries.map(([c, m]) => ({ c, m, w: (m / max) * 100 }));
  });
  const totalMonth = $derived(monthTotals.reduce((a, t) => a + t.m, 0));
  const goodDays = $derived(cells.filter((c) => c.inMonth && c.date < app.today && stats(c.date).list.length && stats(c.date).pct >= 80).length);

  function open(date: string) {
    app.goTo(date, 'day');
  }
</script>

{#if compact}
  <div class="m-compact">
    <div class="wk">{#each weekdayLetters(app.settings.weekStart) as l, i (i)}<span>{l}</span>{/each}</div>
    <div class="cgrid">
      {#each cells as c (c.date)}
        {@const cats = [...new Set((byDate.get(c.date) ?? []).filter((b) => b.cat !== 'break' && b.cat !== 'admin').map((b) => b.cat))].slice(0, 3)}
        <button class="cc" class:out={!c.inMonth} onclick={() => (sel = c.date)} aria-label={longDate(c.date)} aria-pressed={sel === c.date}>
          <span class="num tabular" class:today={c.date === app.today} class:sel={c.date === sel} class:past={c.date < app.today}>{c.day}</span>
          <span class="dots">{#each cats as k (k)}<span style="background: var(--c-{k}-dot)"></span>{/each}</span>
        </button>
      {/each}
    </div>
    <div class="rule"></div>
    <div class="agenda">
      <div class="ah">
        <h2>{longDate(sel)}{sel === app.today ? ' · Today' : ''}</h2>
        <span class="tabular">{selBlocks.length} blocks · {duration(stats(sel).mins)}</span>
      </div>
      {#each selBlocks as b (b.id)}
        <button class="arow cat-{b.cat}" onclick={() => { app.goTo(sel, 'day'); app.select(b.id); }}>
          <span class="at tabular">{clock(b.start)}–{clock(b.end)}</span>
          <span class="an">{b.title}</span>
          {#if b.done}<Icon name="check" size={14} stroke={2.2} />{/if}
        </button>
      {:else}
        <div class="empty">Nothing planned yet.</div>
      {/each}
      <button class="btn primary openday" onclick={() => open(sel)}>Open day <Icon name="arrow-right" size={15} /></button>
    </div>
  </div>
{:else}
  <div class="m-desk">
    <section class="card gridcard" aria-label="Month">
      <div class="scrollx">
        <div class="inner">
          <div class="wkd">{#each weekdayShort(app.settings.weekStart) as w (w)}<span class="label">{w}</span>{/each}</div>
          <div class="mgrid">
            {#each cells as c (c.date)}
              {@const st = stats(c.date)}
              {@const isToday = c.date === app.today}
              {@const past = c.date < app.today}
              <button
                class="cell"
                class:out={!c.inMonth}
                class:today={isToday}
                class:selected={c.date === sel}
                onclick={() => (sel = c.date)}
                ondblclick={() => open(c.date)}
                aria-label="{longDate(c.date)}, {st.list.length} blocks"
                aria-pressed={c.date === sel}
              >
                <span class="ctop">
                  <span class="cnum tabular" class:past>{c.day}</span>
                  {#if st.list.length}
                    <span class="meta tabular">{past ? `${st.pct}% done` : duration(st.mins)}</span>
                  {/if}
                </span>
                <span class="ribbon" class:none={!(byDate.get(c.date) ?? []).length}>
                  {#each byDate.get(c.date) ?? [] as b (b.id)}
                    <span style="left:{Math.max(0, ((b.start - RIBBON_START) / RIBBON_LEN) * 100)}%;width:{((b.end - b.start) / RIBBON_LEN) * 100}%;background:var(--c-{b.cat}-dot)"></span>
                  {/each}
                </span>
                <span class="titles">
                  {#each st.list.filter((b) => b.cat !== 'admin').slice(0, 3) as b (b.id)}
                    <span class="ti"><span class="sq" style="background:var(--c-{b.cat}-dot)"></span><span class="tt">{b.title}</span></span>
                  {/each}
                  {#if st.list.length > 3}<span class="more">+{st.list.length - 3} more</span>{/if}
                </span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <aside class="side">
      <section class="card daycard fade-up">
        <div class="sub">{longDate(sel).split(',')[0]}{sel === app.today ? ' · Today' : ''}</div>
        <h2>{longDate(sel).split(', ')[1]}</h2>
        <div class="sub tabular">{selBlocks.length} blocks · {duration(stats(sel).mins)} planned</div>
        <div class="items">
          {#each selBlocks as b (b.id)}
            <button class="arow cat-{b.cat}" onclick={() => { app.goTo(sel, 'day'); app.select(b.id); }}>
              <span class="at tabular">{clock(b.start)}–{clock(b.end)}</span>
              <span class="an">{b.title}</span>
              {#if b.done}<Icon name="check" size={14} stroke={2.2} />{/if}
            </button>
          {:else}
            <div class="empty">Nothing planned yet. Open the day and start adding blocks.</div>
          {/each}
        </div>
        <button class="btn primary openday" onclick={() => open(sel)}>Open day <Icon name="arrow-right" size={15} /></button>
      </section>

      {#if monthTotals.length}
        <section class="card totals">
          <div class="th"><strong>This month</strong><span class="tabular">{Math.round(totalMonth / 60)}h planned</span></div>
          {#each monthTotals as t (t.c)}
            <div class="trow">
              <div class="tl"><span>{CATEGORY_NAMES[t.c]}</span><span class="tabular">{duration(t.m)}</span></div>
              <div class="tb"><span style="width:{t.w}%;background:var(--c-{t.c}-dot)"></span></div>
            </div>
          {/each}
          <div class="stat"><span>Days at 80%+ done</span><strong class="tabular">{goodDays}</strong></div>
        </section>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .cat-deep { --b: var(--c-deep-bg); --f: var(--c-deep-fg); }
  .cat-meet { --b: var(--c-meet-bg); --f: var(--c-meet-fg); }
  .cat-health { --b: var(--c-health-bg); --f: var(--c-health-fg); }
  .cat-personal { --b: var(--c-personal-bg); --f: var(--c-personal-fg); }
  .cat-admin { --b: var(--c-admin-bg); --f: var(--c-admin-fg); }
  .cat-break { --b: var(--c-break-bg); --f: var(--c-break-fg); }

  .m-desk {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: flex-start;
  }
  .gridcard {
    flex: 999 1 620px;
    min-width: 0;
    padding: 12px;
  }
  .scrollx {
    overflow-x: auto;
  }
  .inner {
    min-width: 600px;
  }
  .wkd,
  .mgrid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .wkd {
    padding: 2px 4px 8px;
  }
  .cell {
    height: 124px;
    border: none;
    border-radius: 12px;
    background: var(--sunken);
    padding: 8px 9px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
    transition: box-shadow 0.15s ease, transform 0.12s ease;
  }
  .cell:hover {
    transform: translateY(-1px);
  }
  .cell.out {
    opacity: 0.42;
  }
  .cell.today {
    background: var(--accent-soft);
  }
  .cell.selected {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .ctop {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .cnum {
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12.5px;
    font-weight: 650;
  }
  .cnum.past {
    color: var(--muted);
  }
  .today .cnum {
    background: var(--accent);
    color: var(--accent-text);
  }
  .meta {
    font-size: 11px;
    color: var(--muted);
  }
  .ribbon {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .ribbon.none {
    visibility: hidden;
  }
  .ribbon span {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .ti {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    min-width: 0;
  }
  .sq {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    flex: none;
  }
  .tt {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    font-size: 11px;
    color: var(--muted);
  }
  .side {
    flex: 1 1 300px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .daycard,
  .totals {
    padding: 18px;
  }
  .sub {
    font-size: 12.5px;
    color: var(--muted);
  }
  h2 {
    margin: 2px 0 4px;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 14px;
  }
  .arow {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 12px;
    border: none;
    border-radius: 10px;
    background: var(--b);
    color: var(--f);
    text-align: left;
  }
  .at {
    width: 78px;
    font-size: 12px;
    opacity: 0.8;
    flex: none;
  }
  .an {
    flex: 1;
    min-width: 0;
    font-weight: 620;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 16px;
    border-radius: 12px;
    border: 1px dashed var(--line);
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
  .openday {
    margin-top: 14px;
    width: 100%;
  }
  .th {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .th span {
    font-size: 12px;
    color: var(--muted);
  }
  .trow {
    margin-bottom: 10px;
  }
  .tl {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    margin-bottom: 5px;
  }
  .tl span:last-child {
    color: var(--muted);
  }
  .tb {
    height: 6px;
    border-radius: 3px;
    background: var(--sunken);
    overflow: hidden;
  }
  .tb span {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--sunken);
    font-size: 12.5px;
    margin-top: 6px;
  }

  /* phone */
  .m-compact {
    padding: 0 12px;
  }
  .m-compact .wk,
  .cgrid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    text-align: center;
  }
  .m-compact .wk {
    font-size: 11px;
    font-weight: 650;
    color: var(--muted);
    padding-bottom: 6px;
  }
  .cgrid {
    row-gap: 4px;
  }
  .cc {
    height: 52px;
    border: none;
    background: transparent;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .cc.out {
    opacity: 0.45;
  }
  .num {
    width: 34px;
    height: 34px;
    border-radius: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 550;
  }
  .num.past {
    color: var(--muted);
  }
  .num.sel {
    box-shadow: inset 0 0 0 1.5px var(--accent);
    font-weight: 700;
  }
  .num.today {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }
  .dots {
    display: flex;
    gap: 3px;
    height: 5px;
  }
  .dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }
  .rule {
    height: 1px;
    background: var(--line);
    margin: 10px 8px 0;
  }
  .agenda {
    padding: 14px 4px 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ah {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 4px 6px;
    gap: 8px;
  }
  .ah h2 {
    font-size: 17px;
    margin: 0;
  }
  .ah span {
    font-size: 12.5px;
    color: var(--muted);
    white-space: nowrap;
  }
  .agenda .arow {
    min-height: 48px;
    border-radius: 14px;
  }
</style>

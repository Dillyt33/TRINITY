<script lang="ts">
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { clock, duration, timeRange } from '../lib/time';
  import { CATEGORY_NAMES } from '../lib/types';

  const cur = $derived(app.current);
  const nxt = $derived(app.next);
  const pct = $derived(cur ? ((app.now - cur.start) / (cur.end - cur.start)) * 100 : 0);
  const steps = $derived(cur ? cur.subtasks.filter((s) => s.done).length : 0);
</script>

{#if app.date === app.today && (cur || nxt)}
  <section class="now card fade-up" aria-label="Now">
    {#if cur}
      <div class="lab cat-{cur.cat}">
        <span class="pulse"></span>Now
        <span class="rng tabular">{timeRange(cur.start, cur.end)}</span>
      </div>
      <button class="title" onclick={() => app.select(cur.id)}>{cur.title}</button>
      <div class="meta">
        {CATEGORY_NAMES[cur.cat]}{cur.subtasks.length ? ` · ${steps} of ${cur.subtasks.length} done` : ''}
      </div>
      <div class="progress">
        <div class="track"><span class="cat-{cur.cat}" style="width:{pct}%"></span></div>
        <span class="left tabular">{cur.end - app.now} min left</span>
      </div>
      <div class="acts">
        <button class="btn primary grow" onclick={() => app.toggleDone(cur.id)}><Icon name="check" size={16} stroke={2.2} />Done</button>
        <button class="btn" onclick={() => app.extend(cur.id, 15)}>+15 min</button>
        <button class="btn icon" aria-label="Open details" onclick={() => app.select(cur.id)}><Icon name="chevron-right" /></button>
      </div>
    {:else if nxt}
      <div class="lab cat-{nxt.cat}"><span class="dot2"></span>Up next <span class="rng tabular">in {duration(nxt.start - app.now)}</span></div>
      <button class="title" onclick={() => app.select(nxt.id)}>{nxt.title}</button>
      <div class="meta tabular">{clock(nxt.start)} · {duration(nxt.end - nxt.start)} · {CATEGORY_NAMES[nxt.cat]}</div>
    {/if}
  </section>
{/if}

<style>
  .cat-deep { --d: var(--c-deep-dot); }
  .cat-meet { --d: var(--c-meet-dot); }
  .cat-health { --d: var(--c-health-dot); }
  .cat-personal { --d: var(--c-personal-dot); }
  .cat-admin { --d: var(--c-admin-dot); }
  .cat-break { --d: var(--c-break-dot); }
  .now {
    padding: 16px;
    border-radius: 22px;
  }
  .lab {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--d);
  }
  .pulse,
  .dot2 {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--d);
  }
  .pulse {
    animation: pulse 2s ease-in-out infinite;
  }
  .rng {
    margin-left: auto;
    letter-spacing: 0;
    text-transform: none;
    font-weight: 500;
    font-size: 12px;
    color: var(--muted);
  }
  .title {
    display: block;
    border: none;
    background: none;
    padding: 0;
    margin-top: 8px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-align: left;
  }
  .meta {
    font-size: 13px;
    color: var(--muted);
    margin-top: 3px;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
  }
  .track {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: var(--sunken);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--d);
    transition: width 0.4s var(--ease);
  }
  .left {
    font-size: 13px;
    font-weight: 650;
  }
  .acts {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
  .acts .btn {
    height: 44px;
    border-radius: 14px;
  }
  .acts .btn.icon {
    width: 44px;
  }
  .grow {
    flex: 1;
  }
</style>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { layoutColumns } from '../lib/layout';
  import { clamp, clock, clockAp, snapTo, timeRange } from '../lib/time';
  import type { Block } from '../lib/types';

  interface Props {
    blocks: Block[];
    date: string;
    isToday: boolean;
    now: number;
    dayStart: number;
    dayEnd: number;
    snap: number;
    ppm?: number;
    selectedId: string | null;
    touchFirst?: boolean;
    /** false: the page scrolls instead of the timeline (phone). */
    contained?: boolean;
    onselect: (id: string | null) => void;
    onchange: (id: string, start: number, end: number) => void;
    oncreate: (start: number, end: number) => void;
    ondroptask?: (taskId: string, start: number) => void;
  }

  let {
    blocks, date, isToday, now, dayStart, dayEnd, snap, ppm = 1, selectedId, touchFirst = false, contained = true,
    onselect, onchange, oncreate, ondroptask,
  }: Props = $props();

  const TOP = 12;
  const GUTTER = 58;

  let scroller: HTMLDivElement | undefined = $state();
  let grid: HTMLDivElement | undefined = $state();

  interface Drag {
    id: string;
    mode: 'move' | 'resize';
    pointerId: number;
    startY: number;
    origStart: number;
    origEnd: number;
    curStart: number;
    curEnd: number;
    active: boolean;
    touch: boolean;
  }
  let drag = $state<Drag | null>(null);
  let create = $state<{ pointerId: number; anchor: number; cur: number; touch: boolean; active: boolean; startY: number } | null>(null);
  let hoverMin = $state<number | null>(null);
  let dropMin = $state<number | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;

  const y = (min: number) => (min - dayStart) * ppm + TOP;
  const height = $derived((dayEnd - dayStart) * ppm + TOP * 2);

  const hours = $derived.by(() => {
    const out: { min: number; label: string }[] = [];
    for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) {
      const h = Math.floor(m / 60) % 24;
      out.push({ min: m, label: h === 12 ? 'Noon' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` });
    }
    return out;
  });

  const shown = $derived(
    blocks.filter((b) => b.end > dayStart).map((b) =>
      drag && drag.id === b.id && drag.active ? { ...b, start: drag.curStart, end: drag.curEnd } : b,
    ),
  );
  const placement = $derived(layoutColumns(shown.map((b) => ({ id: b.id, start: b.start, end: b.end }))));

  function minuteAt(clientY: number): number {
    const r = grid!.getBoundingClientRect();
    return dayStart + (clientY - r.top - TOP) / ppm;
  }

  // ----- moving and resizing blocks -----
  function blockDown(e: PointerEvent, b: Block, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.stopPropagation();
    const touch = e.pointerType !== 'mouse';
    drag = { id: b.id, mode, pointerId: e.pointerId, startY: e.clientY, origStart: b.start, origEnd: b.end, curStart: b.start, curEnd: b.end, active: false, touch };
    if (touch) {
      // Hold to drag on touch screens, so a normal swipe still scrolls.
      const delay = mode === 'resize' ? 120 : 260;
      pressTimer = setTimeout(() => {
        if (drag && drag.pointerId === e.pointerId) {
          drag.active = true;
          navigator.vibrate?.(8);
        }
      }, delay);
    }
    window.addEventListener('pointermove', blockMove);
    window.addEventListener('pointerup', blockUp);
    window.addEventListener('pointercancel', blockCancel);
  }

  function blockMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (drag.touch) {
        if (Math.abs(dy) > 8) cancelDrag(); // it's a scroll
        return;
      }
      if (Math.abs(dy) < 3) return;
      drag.active = true;
    }
    const delta = snapTo(dy / ppm, snap);
    if (drag.mode === 'move') {
      const len = drag.origEnd - drag.origStart;
      drag.curStart = clamp(drag.origStart + delta, dayStart, dayEnd - len);
      drag.curEnd = drag.curStart + len;
    } else {
      drag.curEnd = clamp(snapTo(drag.origEnd + dy / ppm, snap), drag.origStart + snap, dayEnd);
    }
  }

  function blockUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    cleanupDrag();
    if (d.active) {
      // A drag (or a long press that didn't move) shouldn't also count as a tap.
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 400);
      if (d.curStart !== d.origStart || d.curEnd !== d.origEnd) onchange(d.id, d.curStart, d.curEnd);
      else setTimeout(() => onselect(d.id), 60);
    }
    // A plain tap selects in the click handler, after the browser's own click lands.

  }

  function blockCancel(e: PointerEvent) {
    if (drag && e.pointerId === drag.pointerId) cancelDrag();
  }

  function cancelDrag() {
    cleanupDrag();
  }

  function cleanupDrag() {
    clearTimeout(pressTimer);
    drag = null;
    window.removeEventListener('pointermove', blockMove);
    window.removeEventListener('pointerup', blockUp);
    window.removeEventListener('pointercancel', blockCancel);
  }

  function blockKey(e: KeyboardEvent, b: Block) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect(b.id);
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.key === 'ArrowUp' ? -snap : snap;
    if (e.shiftKey) onchange(b.id, b.start, clamp(b.end + step, b.start + snap, dayEnd));
    else {
      const len = b.end - b.start;
      const s = clamp(b.start + step, dayStart, dayEnd - len);
      onchange(b.id, s, s + len);
    }
  }

  // ----- creating blocks on empty space -----
  function gridDown(e: PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.blk')) return;
    const m = clamp(Math.floor(minuteAt(e.clientY) / snap) * snap, dayStart, dayEnd - snap);
    const touch = e.pointerType !== 'mouse';
    create = { pointerId: e.pointerId, anchor: m, cur: m + snap, touch, active: false, startY: e.clientY };
    if (touch) {
      pressTimer = setTimeout(() => {
        if (create && create.pointerId === e.pointerId) {
          navigator.vibrate?.(8);
          const c = create;
          endCreate();
          oncreate(c.anchor, c.anchor + 30);
        }
      }, 450);
    }
    window.addEventListener('pointermove', createMove);
    window.addEventListener('pointerup', createUp);
    window.addEventListener('pointercancel', endCreate);
  }

  function createMove(e: PointerEvent) {
    if (!create || e.pointerId !== create.pointerId) return;
    if (create.touch) {
      if (Math.abs(e.clientY - create.startY) > 8) endCreate();
      return;
    }
    const m = clamp(Math.ceil(minuteAt(e.clientY) / snap) * snap, dayStart, dayEnd);
    create.cur = m;
    if (Math.abs(e.clientY - create.startY) > 4) create.active = true;
  }

  function createUp(e: PointerEvent) {
    if (!create || e.pointerId !== create.pointerId) return;
    const c = create;
    endCreate();
    if (c.touch) {
      onselect(null);
      return;
    }
    if (c.active && Math.abs(c.cur - c.anchor) >= snap) {
      const s = Math.min(c.anchor, c.cur);
      const en = Math.max(c.anchor + snap, c.cur);
      oncreate(s, en);
    } else {
      onselect(null);
    }
  }

  function endCreate() {
    clearTimeout(pressTimer);
    create = null;
    window.removeEventListener('pointermove', createMove);
    window.removeEventListener('pointerup', createUp);
    window.removeEventListener('pointercancel', endCreate);
  }

  function gridHover(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || drag || create) return;
    if ((e.target as HTMLElement).closest('.blk')) {
      hoverMin = null;
      return;
    }
    hoverMin = clamp(Math.floor(minuteAt(e.clientY) / snap) * snap, dayStart, dayEnd - snap);
  }

  function gridDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.blk')) return;
    const m = clamp(Math.floor(minuteAt(e.clientY) / snap) * snap, dayStart, dayEnd - 60);
    oncreate(m, m + 60);
  }

  // ----- dropping unscheduled tasks -----
  function dragOver(e: DragEvent) {
    if (!ondroptask || !e.dataTransfer?.types.includes('text/trinity-task')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dropMin = clamp(Math.floor(minuteAt(e.clientY) / snap) * snap, dayStart, dayEnd - snap);
  }

  function drop(e: DragEvent) {
    const id = e.dataTransfer?.getData('text/trinity-task');
    if (id && dropMin !== null) ondroptask?.(id, dropMin);
    dropMin = null;
  }

  // Block touch scrolling only while a block is being dragged.
  function preventScroll(node: HTMLElement) {
    const h = (e: TouchEvent) => {
      if (drag?.active || (create && !create.touch)) e.preventDefault();
    };
    node.addEventListener('touchmove', h, { passive: false });
    return { destroy: () => node.removeEventListener('touchmove', h) };
  }

  async function scrollToFocus() {
    await tick();
    if (!scroller || !grid) return;
    const first = blocks[0]?.start ?? 8 * 60;
    const focus = isToday ? now - 75 : Math.min(first, 8 * 60) - 30;
    const offset = Math.max(0, (focus - dayStart) * ppm);
    if (contained) {
      scroller.scrollTo({ top: offset, behavior: 'auto' });
      return;
    }
    // Phone: the page scrolls; the caller trims past hours instead of scrolling.
  }

  let lastDate = '';
  $effect(() => {
    if (date !== lastDate) {
      lastDate = date;
      scrollToFocus();
    }
  });

  onMount(() => () => {
    cleanupDrag();
    endCreate();
  });

  const nowY = $derived(y(now));
  const showNow = $derived(isToday && now >= dayStart && now <= dayEnd);
  const draggedLabel = $derived(drag?.active ? timeRange(drag.curStart, drag.curEnd) : '');
</script>

<div class="scroller" class:free={!contained} bind:this={scroller} use:preventScroll>
  <div
    class="grid"
    class:dropping={dropMin !== null}
    bind:this={grid}
    style="height:{height}px"
    onpointerdown={gridDown}
    onpointermove={gridHover}
    onpointerleave={() => (hoverMin = null)}
    ondblclick={gridDblClick}
    ondragover={dragOver}
    ondragleave={() => (dropMin = null)}
    ondrop={drop}
    role="presentation"
  >
    {#each hours as h (h.min)}
      <div class="hour" style="top:{y(h.min)}px">
        <span class="hlabel tabular">{h.label}</span>
        <span class="hline"></span>
      </div>
      {#if h.min + 30 < dayEnd}
        <div class="half" style="top:{y(h.min + 30)}px"></div>
      {/if}
    {/each}

    <div class="lane" style="left:{GUTTER}px">
      {#if hoverMin !== null && !touchFirst}
        <div class="ghost" style="top:{y(hoverMin)}px;height:{snap * 2 * ppm - 2}px">
          <Icon name="plus" size={12} /> {clockAp(hoverMin)} <span class="hint">double-click or drag</span>
        </div>
      {/if}
      {#if create?.active}
        {@const s = Math.min(create.anchor, create.cur)}
        {@const en = Math.max(create.anchor + snap, create.cur)}
        <div class="creating" style="top:{y(s)}px;height:{(en - s) * ppm - 2}px">{timeRange(s, en)}</div>
      {/if}
      {#if dropMin !== null}
        <div class="creating" style="top:{y(dropMin)}px;height:{30 * ppm}px">Drop at {clockAp(dropMin)}</div>
      {/if}

      {#each shown as b (b.id)}
        {@const p = placement.get(b.id) ?? { col: 0, cols: 1 }}
        {@const vs = Math.max(b.start, dayStart)}
        {@const h = Math.max(18, (b.end - vs) * ppm - 3)}
        {@const compact = h < 36}
        {@const live = isToday && !b.done && b.start <= now && now < b.end}
        {@const dragging = drag?.id === b.id && drag.active}
        <div
          class="blk cat-{b.cat}"
          class:compact
          class:done={b.done}
          class:selected={b.id === selectedId}
          class:live
          class:dragging
          style="top:{y(vs) + 1}px;height:{h}px;left:calc({(p.col / p.cols) * 100}% + 2px);width:calc({100 / p.cols}% - 6px)"
        >
          <button
            class="body"
            onpointerdown={(e) => blockDown(e, b, 'move')}
            onclick={(e) => {
              if (suppressClick) {
                suppressClick = false;
                return;
              }
              onselect(b.id);
            }}
            onkeydown={(e) => blockKey(e, b)}
            aria-label="{b.title}, {timeRange(b.start, b.end)}{b.done ? ', done' : ''}"
            aria-pressed={b.id === selectedId}
          >
            {#if compact}
              <span class="row">
                <span class="title">{b.title}</span>
                <span class="time tabular">{clock(b.start)}</span>
                {#if b.done}<span class="end"><Icon name="check" size={13} stroke={2.2} /></span>{/if}
              </span>
            {:else}
              <span class="row">
                <span class="title">{b.title}</span>
                {#if b.source === 'claude' || b.source === 'coach'}
                  <span class="badge"><Icon name="sparkle" size={10} />{b.source === 'coach' ? 'Coach' : 'Claude'}</span>
                {/if}
                {#if b.done}<span class="end"><Icon name="check" size={14} stroke={2.2} /></span>{/if}
                {#if live}<span class="end left tabular">{b.end - now} min left</span>{/if}
              </span>
              <span class="time tabular">{timeRange(b.start, b.end)}</span>
              {#if h >= 78 && b.subtasks.length}
                <span class="sub">{b.subtasks.filter((s) => s.done).length} of {b.subtasks.length} done</span>
              {/if}
              {#if live}
                <span class="prog"><span style="width:{((now - b.start) / (b.end - b.start)) * 100}%"></span></span>
              {/if}
            {/if}
          </button>
          {#if !b.done}
            <div class="resize" class:touch={touchFirst} onpointerdown={(e) => blockDown(e, b, 'resize')} role="presentation" title="Drag to change length">
              <span></span>
            </div>
          {/if}
          {#if dragging}
            <span class="tip tabular">{draggedLabel}</span>
          {/if}
        </div>
      {/each}

      {#if showNow}
        <div class="now" style="top:{nowY}px" aria-hidden="true"><span class="knob"></span></div>
      {/if}
    </div>
    {#if showNow}
      <span class="nowlabel tabular" style="top:{nowY - 8}px">{clock(now)}</span>
    {/if}
  </div>
</div>

<style>
  .scroller {
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .scroller.free {
    height: auto;
    overflow: visible;
  }
  .grid {
    position: relative;
    touch-action: pan-y;
    -webkit-user-select: none;
    user-select: none;
  }
  .hour {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    pointer-events: none;
  }
  .hlabel {
    width: 48px;
    text-align: right;
    font-size: 11px;
    color: var(--faint);
    transform: translateY(-0.5px);
  }
  .hline {
    flex: 1;
    height: 1px;
    background: var(--line);
  }
  .half {
    position: absolute;
    left: 58px;
    right: 0;
    border-top: 1px dashed var(--line);
    opacity: 0.55;
    pointer-events: none;
  }
  .lane {
    position: absolute;
    top: 0;
    right: 4px;
    bottom: 0;
  }
  .ghost,
  .creating {
    position: absolute;
    left: 2px;
    right: 2px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    font-size: 12px;
    pointer-events: none;
  }
  .ghost {
    color: var(--muted);
    border: 1px dashed var(--line);
  }
  .ghost .hint {
    margin-left: auto;
    color: var(--faint);
    font-size: 11px;
  }
  .creating {
    background: var(--accent-soft);
    color: var(--accent-ink);
    border: 1.5px dashed var(--accent);
    font-weight: 600;
    align-items: flex-start;
    padding-top: 6px;
  }

  .blk {
    position: absolute;
    border-radius: 10px;
    background: var(--bg-c);
    color: var(--fg-c);
    transition: top 0.22s var(--ease), height 0.22s var(--ease), left 0.2s var(--ease), width 0.2s var(--ease), box-shadow 0.18s ease, opacity 0.2s ease, transform 0.12s ease;
    --bg-c: var(--c-personal-bg);
    --fg-c: var(--c-personal-fg);
    --dot-c: var(--c-personal-dot);
  }
  .blk.cat-deep { --bg-c: var(--c-deep-bg); --fg-c: var(--c-deep-fg); --dot-c: var(--c-deep-dot); }
  .blk.cat-meet { --bg-c: var(--c-meet-bg); --fg-c: var(--c-meet-fg); --dot-c: var(--c-meet-dot); }
  .blk.cat-health { --bg-c: var(--c-health-bg); --fg-c: var(--c-health-fg); --dot-c: var(--c-health-dot); }
  .blk.cat-admin { --bg-c: var(--c-admin-bg); --fg-c: var(--c-admin-fg); --dot-c: var(--c-admin-dot); }
  .blk.cat-break { --bg-c: var(--c-break-bg); --fg-c: var(--c-break-fg); --dot-c: var(--c-break-dot); }
  .blk.done {
    opacity: 0.58;
  }
  .blk.live {
    box-shadow: 0 0 0 1.5px var(--dot-c);
  }
  .blk.selected {
    box-shadow: 0 0 0 2px var(--dot-c), 0 6px 18px rgba(0, 0, 0, 0.12);
    z-index: 2;
  }
  .blk.dragging {
    z-index: 5;
    transition: box-shadow 0.18s ease;
    box-shadow: 0 0 0 2px var(--dot-c), var(--shadow);
    transform: scale(1.01);
    opacity: 0.96;
  }
  .body {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 8px 11px;
    border-radius: inherit;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    cursor: grab;
    touch-action: pan-y;
  }
  .dragging .body {
    cursor: grabbing;
  }
  .compact .body {
    padding: 0 10px;
    justify-content: center;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .title {
    font-weight: 620;
    font-size: 13.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .compact .title {
    font-size: 12px;
  }
  .time {
    font-size: 12px;
    opacity: 0.8;
    white-space: nowrap;
  }
  .sub {
    margin-top: auto;
    font-size: 12px;
    opacity: 0.8;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-size: 11px;
    font-weight: 550;
    flex: none;
  }
  .end {
    margin-left: auto;
    flex: none;
    display: inline-flex;
  }
  .end.left {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--dot-c);
    color: var(--surface);
    font-size: 11px;
    font-weight: 700;
  }
  .prog {
    margin-top: auto;
    height: 4px;
    border-radius: 2px;
    background: rgba(127, 127, 127, 0.22);
    overflow: hidden;
  }
  .prog span {
    display: block;
    height: 100%;
    background: var(--dot-c);
    border-radius: 2px;
  }
  .resize {
    position: absolute;
    left: 20%;
    right: 20%;
    bottom: -3px;
    height: 10px;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
  }
  .resize span {
    width: 28px;
    height: 4px;
    border-radius: 2px;
    background: var(--dot-c);
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .blk:hover .resize span,
  .selected .resize span {
    opacity: 0.7;
  }
  .resize.touch {
    height: 22px;
    bottom: -10px;
    display: none;
  }
  .selected .resize.touch {
    display: flex;
  }
  .tip {
    position: absolute;
    right: 8px;
    top: -26px;
    padding: 3px 8px;
    border-radius: 7px;
    background: var(--text);
    color: var(--bg);
    font-size: 11.5px;
    font-weight: 650;
    white-space: nowrap;
    pointer-events: none;
  }
  .now {
    position: absolute;
    left: -10px;
    right: 0;
    height: 2px;
    margin-top: -1px;
    background: var(--now);
    z-index: 4;
    pointer-events: none;
  }
  .knob {
    position: absolute;
    left: 2px;
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--now);
    animation: pulse 2s ease-in-out infinite;
  }
  .nowlabel {
    position: absolute;
    left: 0;
    width: 48px;
    text-align: right;
    font-size: 11px;
    font-weight: 750;
    color: var(--now);
    background: var(--tl-bg, var(--surface));
    z-index: 4;
    pointer-events: none;
  }
</style>

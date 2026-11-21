<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './components/Icon.svelte';
  import Logo from './components/Logo.svelte';
  import Timeline from './components/Timeline.svelte';
  import Detail from './components/Detail.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import MonthView from './components/MonthView.svelte';
  import QuickAdd from './components/QuickAdd.svelte';
  import NowCard from './components/NowCard.svelte';
  import Sheet from './components/Sheet.svelte';
  import Toast from './components/Toast.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import SignIn from './components/SignIn.svelte';
  import { app } from './lib/app.svelte';
  import { applyTheme, resolveTheme, THEMES } from './lib/themes';
  import { addDays, addMonths, duration, fromIso, longDate, monthTitle, weekOf, WEEKDAYS, MONTHS } from './lib/time';
  import { findFreeSlot } from './lib/layout';

  const mqPhone = window.matchMedia('(max-width: 820px)');
  const mqWide = window.matchMedia('(min-width: 1180px)');
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  let phone = $state(mqPhone.matches);
  let wide = $state(mqWide.matches);
  let prefersDark = $state(mqDark.matches);
  let online = $state(navigator.onLine);
  let inboxOpen = $state(false);
  let showEarlier = $state(false);
  let earlierFor = '';
  $effect(() => {
    if (app.date !== earlierFor) {
      earlierFor = app.date;
      showEarlier = false;
    }
  });
  let quick: ReturnType<typeof QuickAdd> | undefined = $state();

  onMount(() => {
    app.init();
    const onPhone = () => (phone = mqPhone.matches);
    const onWide = () => (wide = mqWide.matches);
    const onDark = () => (prefersDark = mqDark.matches);
    const onOnline = () => (online = navigator.onLine);
    mqPhone.addEventListener('change', onPhone);
    mqWide.addEventListener('change', onWide);
    mqDark.addEventListener('change', onDark);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    return () => {
      mqPhone.removeEventListener('change', onPhone);
      mqWide.removeEventListener('change', onWide);
      mqDark.removeEventListener('change', onDark);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
    };
  });

  // Theme
  $effect(() => {
    const name = resolveTheme(app.settings.theme, prefersDark);
    applyTheme(name);
    try {
      localStorage.setItem('trinity:theme-cache', JSON.stringify({ bg: THEMES[name].bg, dark: THEMES[name].dark }));
    } catch {
      /* private mode */
    }
  });

  // Keep the data subscription aligned with the month being viewed.
  $effect(() => {
    void app.date;
    void app.settings.weekStart;
    void app.backend;
    app.resubscribe();
  });

  function onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (phone) app.quickAddOpen = true;
      else quick?.focus();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') app.select(null);
    else if (e.key === 't') app.goTo(app.today);
    else if (e.key === 'ArrowLeft' && !app.selectedId) app.view === 'month' ? app.goTo(addMonths(app.date, -1)) : app.shiftDay(-1);
    else if (e.key === 'ArrowRight' && !app.selectedId) app.view === 'month' ? app.goTo(addMonths(app.date, 1)) : app.shiftDay(1);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && app.selectedId) app.deleteBlock(app.selectedId);
    else if (e.key === 'm') app.view = app.view === 'day' ? 'month' : 'day';
  }

  const isToday = $derived(app.date === app.today);
  const relDay = $derived(
    app.date === app.today ? 'Today' : app.date === addDays(app.today, 1) ? 'Tomorrow' : app.date === addDays(app.today, -1) ? 'Yesterday' : WEEKDAYS[fromIso(app.date).getDay()],
  );
  const real = $derived(app.dayBlocks.filter((b) => b.cat !== 'break'));
  const planned = $derived(real.reduce((a, b) => a + b.end - b.start, 0));
  const doneCount = $derived(real.filter((b) => b.done).length);
  const freeLeft = $derived.by(() => {
    if (!isToday) return null;
    let free = 0;
    let t = Math.max(app.now, app.settings.dayStart);
    const end = Math.min(app.settings.dayEnd, 22 * 60);
    for (const b of app.dayBlocks) {
      if (b.end <= t) continue;
      if (b.start > t) free += Math.min(b.start, end) - t;
      t = Math.max(t, b.end);
      if (t >= end) break;
    }
    if (t < end) free += end - t;
    return Math.max(0, free);
  });
  const week = $derived(weekOf(app.date, app.settings.weekStart));
  const hasAnyData = $derived(app.blocks.length > 0 || app.tasks.length > 0);
  const syncLabel = $derived(
    !online ? 'Offline · will sync' : app.mode === 'firebase' && app.user ? 'Synced' : 'This device only',
  );

  function createAt(start: number, end: number) {
    app.addBlock({ date: app.date, start, end, title: 'New block', cat: 'deep' }, { select: true, focus: true });
  }

  function newBlockNow() {
    const { dayStart, dayEnd, snap } = app.settings;
    const after = isToday ? app.now : 9 * 60;
    const at = findFreeSlot(app.dayBlocks, 60, after, dayStart, dayEnd, snap) ?? Math.max(dayStart, 9 * 60);
    createAt(at, at + 60);
  }

  const headerDate = $derived(fromIso(app.date));
  // On the phone, today's timeline starts an hour before now; earlier hours are one tap away.
  const phoneStart = $derived(
    isToday && !showEarlier
      ? Math.min(Math.max(app.settings.dayStart, Math.floor((app.now - 60) / 60) * 60), app.settings.dayEnd - 180)
      : app.settings.dayStart,
  );
  const hiddenEarlier = $derived(app.dayBlocks.filter((b) => b.end <= phoneStart).length);
  const showSignIn = $derived(app.mode === 'firebase' && app.authReady && !app.user && !app.localOnly);
</script>

<svelte:window onkeydown={onKey} />

{#if !app.authReady}
  <div class="splash"><Logo size={48} /></div>
{:else if showSignIn}
  <SignIn />
{:else if phone}
  <!-- ================= iPhone layout ================= -->
  <div class="phone">
    <header class="ph-head">
      <button class="ph-date" onclick={() => app.goTo(app.today)} aria-label="Go to today">
        {#if app.view === 'day'}
          <span class="ph-sub">{relDay === WEEKDAYS[headerDate.getDay()] ? headerDate.getFullYear() : relDay}</span>
          <span class="ph-title">{WEEKDAYS[headerDate.getDay()]}, {MONTHS[headerDate.getMonth()].slice(0, 3)} {headerDate.getDate()}</span>
        {:else}
          <span class="ph-sub">{headerDate.getFullYear()}</span>
          <span class="ph-title">{MONTHS[headerDate.getMonth()]}</span>
        {/if}
      </button>
      <div class="ph-actions">
        {#if app.view === 'month'}
          <button class="btn icon round" aria-label="Previous month" onclick={() => app.goTo(addMonths(app.date, -1))}><Icon name="chevron-left" /></button>
          <button class="btn icon round" aria-label="Next month" onclick={() => app.goTo(addMonths(app.date, 1))}><Icon name="chevron-right" /></button>
        {/if}
        <button class="btn icon round" aria-label="Settings" onclick={() => (app.settingsOpen = true)}><Icon name="settings" size={18} /></button>
      </div>
    </header>

    {#if app.view === 'day'}
      <div class="ph-week" role="group" aria-label="This week">
        <button class="wkbtn" aria-label="Previous week" onclick={() => app.goTo(addDays(app.date, -7))}><Icon name="chevron-left" size={14} /></button>
        {#each week as d (d)}
          {@const dd = fromIso(d)}
          <button class="wday" class:today={d === app.today} class:sel={d === app.date} class:past={d < app.today} onclick={() => app.goTo(d)} aria-label={longDate(d)}>
            <span>{WEEKDAYS[dd.getDay()][0]}</span>
            <strong class="tabular">{dd.getDate()}</strong>
          </button>
        {/each}
        <button class="wkbtn" aria-label="Next week" onclick={() => app.goTo(addDays(app.date, 7))}><Icon name="chevron-right" size={14} /></button>
      </div>
      <div class="ph-scroll scroll-root">
        <div class="ph-pad"><NowCard /></div>
        <div class="ph-tlhead">
          <h2>{relDay === 'Today' ? 'Today’s plan' : `${relDay}’s plan`}</h2>
          <span class="tabular">{real.length} blocks · {duration(planned)}</span>
        </div>
        {#if app.loaded && app.dayBlocks.length === 0}
          <div class="ph-pad">
            <div class="empty card">
              <strong>Nothing planned yet.</strong>
              <span>Tap + to add a block, or press and hold an empty spot on the timeline.</span>
              {#if !hasAnyData}<button class="btn" onclick={() => app.loadSample()}>Try a sample day</button>{/if}
            </div>
          </div>
        {/if}
        {#if phoneStart > app.settings.dayStart}
          <div class="ph-pad">
            <button class="earlier" onclick={() => (showEarlier = true)}>
              <Icon name="chevron-down" size={14} />Show earlier{hiddenEarlier ? ` · ${hiddenEarlier} block${hiddenEarlier === 1 ? '' : 's'}` : ''}
            </button>
          </div>
        {/if}
        <div class="ph-tl">
          <Timeline
            blocks={app.dayBlocks}
            date={app.date}
            {isToday}
            now={app.now}
            dayStart={phoneStart}
            dayEnd={app.settings.dayEnd}
            snap={app.settings.snap}
            ppm={1.15}
            selectedId={app.selectedId}
            touchFirst
            contained={false}
            onselect={(id) => app.select(id)}
            onchange={(id, start, end) => app.updateBlock(id, { start, end })}
            oncreate={createAt}
          />
        </div>
      </div>
    {:else}
      <div class="ph-scroll"><MonthView compact /></div>
    {/if}

    <button class="fab" aria-label="Add a block" onclick={() => (app.quickAddOpen = true)}><Icon name="plus" size={24} stroke={2} /></button>

    <nav class="tabs" aria-label="Sections">
      <button class:on={app.view === 'day'} aria-current={app.view === 'day' ? 'page' : undefined} onclick={() => app.goTo(app.view === 'day' ? app.today : app.date, 'day')}>
        <Icon name="list" size={22} stroke={1.6} /><span>Today</span>
      </button>
      <button class:on={app.view === 'month'} aria-current={app.view === 'month' ? 'page' : undefined} onclick={() => (app.view = 'month')}>
        <Icon name="calendar" size={22} stroke={1.6} /><span>Month</span>
      </button>
      <button onclick={() => (inboxOpen = true)}>
        <Icon name="inbox" size={22} stroke={1.6} /><span>Inbox</span>
        {#if app.openTasks.length}<em class="tabular">{app.openTasks.length}</em>{/if}
      </button>
    </nav>

    <Sheet open={!!app.selected} onclose={() => app.select(null)} label="Block details">
      {#if app.selected}<Detail block={app.selected} />{/if}
    </Sheet>
    <Sheet open={app.quickAddOpen} onclose={() => (app.quickAddOpen = false)} label="Add a block">
      <div class="qa-sheet">
        <h2>Add to your day</h2>
        <QuickAdd big autofocus ondone={() => (app.quickAddOpen = false)} />
        <div class="examples">
          <span class="label">Try</span>
          <span>gym tomorrow 6pm 1h #health</span>
          <span>call mom fri 3-3:30pm</span>
          <span>renew passport ~20m</span>
        </div>
        <button class="btn" onclick={() => { app.quickAddOpen = false; newBlockNow(); }}><Icon name="plus" size={15} />Blank block in the next free slot</button>
      </div>
    </Sheet>
    <Sheet open={inboxOpen} onclose={() => (inboxOpen = false)} label="Inbox">
      <div class="inbox">
        <h2>Inbox</h2>
        <p class="muted">To-dos without a time. Tap the arrow to drop one into the next free slot.</p>
        <Sidebar inboxOnly />
      </div>
    </Sheet>
    <Sheet open={app.settingsOpen} onclose={() => (app.settingsOpen = false)} label="Settings">
      <SettingsPanel />
    </Sheet>
    <Toast bottom={100} />
  </div>
{:else}
  <!-- ================= Mac / desktop layout ================= -->
  <div class="desk">
    <header class="top">
      <div class="brand"><Logo /><span>Trinity</span></div>
      <div class="nav">
        <button class="btn icon" aria-label={app.view === 'month' ? 'Previous month' : 'Previous day'} onclick={() => (app.view === 'month' ? app.goTo(addMonths(app.date, -1)) : app.shiftDay(-1))}><Icon name="chevron-left" /></button>
        <button class="btn" onclick={() => app.goTo(app.today)}>Today</button>
        <button class="btn icon" aria-label={app.view === 'month' ? 'Next month' : 'Next day'} onclick={() => (app.view === 'month' ? app.goTo(addMonths(app.date, 1)) : app.shiftDay(1))}><Icon name="chevron-right" /></button>
        <h1>{app.view === 'month' ? monthTitle(app.date) : longDate(app.date)}</h1>
      </div>
      <div class="seg" role="tablist" aria-label="View">
        <button role="tab" aria-selected={app.view === 'day'} class:on={app.view === 'day'} onclick={() => (app.view = 'day')}>Day</button>
        <button role="tab" aria-selected={app.view === 'month'} class:on={app.view === 'month'} onclick={() => (app.view = 'month')}>Month</button>
      </div>
      <div class="qa-wrap"><QuickAdd bind:this={quick} /></div>
      <div class="right">
        <span class="sync" class:warn={!online}><Icon name={app.mode === 'firebase' && app.user && online ? 'cloud' : 'cloud-off'} />{syncLabel}</span>
        <button class="btn icon" aria-label="Settings" onclick={() => (app.settingsOpen = true)}><Icon name="settings" /></button>
      </div>
    </header>

    {#if app.view === 'day'}
      <main class="dayview" class:wide>
        <div class="col side-col"><Sidebar /></div>
        <section class="card tl-card" aria-label="Timeline">
          <div class="tl-head">
            <div>
              <h2>{relDay === 'Today' ? 'Today’s plan' : `${relDay}’s plan`}</h2>
              <div class="sum tabular">
                {real.length} blocks · {duration(planned)} planned{freeLeft !== null ? ` · ${duration(freeLeft)} free after now` : ''}
              </div>
            </div>
            <div class="prog">
              <div class="pbar"><span style="width:{real.length ? (doneCount / real.length) * 100 : 0}%"></span></div>
              <span class="tabular">{doneCount} of {real.length} done</span>
            </div>
            <button class="btn" onclick={newBlockNow}><Icon name="plus" size={15} />Block</button>
          </div>
          {#if app.loaded && app.dayBlocks.length === 0}
            <div class="empty-banner fade-up">
              <span><strong>Nothing planned for {relDay.toLowerCase() === 'today' ? 'today' : longDate(app.date)}.</strong> Type in the add bar, drag across the timeline, or drop a to-do onto it.</span>
              {#if !hasAnyData}<button class="btn" onclick={() => app.loadSample()}>Try a sample day</button>{/if}
            </div>
          {/if}
          <div class="tl-body">
            <Timeline
              blocks={app.dayBlocks}
              date={app.date}
              {isToday}
              now={app.now}
              dayStart={app.settings.dayStart}
              dayEnd={app.settings.dayEnd}
              snap={app.settings.snap}
              ppm={1}
              selectedId={app.selectedId}
              onselect={(id) => app.select(id)}
              onchange={(id, start, end) => app.updateBlock(id, { start, end })}
              oncreate={createAt}
              ondroptask={(id, start) => app.scheduleTask(id, app.date, start)}
            />
          </div>
        </section>
        {#if wide}
          <aside class="card col detail-col" aria-label="Details">
            {#if app.selected}
              {#key app.selected.id}<Detail block={app.selected} onclose={() => app.select(null)} />{/key}
            {:else}
              <div class="placeholder">
                <NowCard />
                <div class="ph-hint">
                  <strong>Click a block to see its checklist and notes.</strong>
                  <span>Drag blocks to move them, drag the bottom edge to resize. <kbd>⌘K</kbd> adds, <kbd>←</kbd><kbd>→</kbd> change day, <kbd>M</kbd> month.</span>
                </div>
              </div>
            {/if}
          </aside>
        {/if}
      </main>
      {#if !wide}
        <Sheet open={!!app.selected} onclose={() => app.select(null)} label="Block details">
          {#if app.selected}<Detail block={app.selected} />{/if}
        </Sheet>
      {/if}
    {:else}
      <main class="monthview"><MonthView /></main>
    {/if}

    <Sheet open={app.settingsOpen} onclose={() => (app.settingsOpen = false)} label="Settings">
      <SettingsPanel />
    </Sheet>
    <Toast />
  </div>
{/if}

<style>
  .splash {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pulse 1.6s ease-in-out infinite;
  }
  kbd {
    font-family: inherit;
    font-size: 11px;
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 1px 5px;
    margin: 0 1px;
    color: var(--text);
  }
  .muted {
    color: var(--muted);
  }

  /* ---------- desktop ---------- */
  .desk {
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 18px;
    padding: 12px 22px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    position: relative;
    z-index: 20;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 750;
    font-size: 16px;
    letter-spacing: -0.01em;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nav .btn {
    height: 34px;
  }
  .nav .btn.icon {
    width: 34px;
  }
  h1 {
    margin: 0 0 0 8px;
    font-size: 18px;
    font-weight: 680;
    letter-spacing: -0.015em;
    white-space: nowrap;
  }
  .seg {
    display: flex;
    padding: 3px;
    gap: 2px;
    border-radius: 10px;
    background: var(--sunken);
  }
  .seg button {
    height: 30px;
    padding: 0 14px;
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
  .qa-wrap {
    flex: 1 1 320px;
    min-width: 0;
    max-width: 560px;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .sync.warn {
    color: var(--now);
  }
  .dayview {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 18px;
    padding: 18px 22px 22px;
  }
  .dayview.wide {
    grid-template-columns: 270px minmax(0, 1fr) 340px;
  }
  .col {
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .tl-card {
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    overflow: hidden;
    --tl-bg: var(--surface);
  }
  .tl-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    padding: 14px 18px 10px;
    border-bottom: 1px solid var(--line);
  }
  .tl-head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 680;
  }
  .sum {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }
  .prog {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 170px;
  }
  .prog span {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .pbar {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--sunken);
    overflow: hidden;
  }
  .pbar span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.35s var(--ease);
  }
  .tl-head .btn {
    height: 32px;
  }
  .empty-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    margin: 12px 18px 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: 13px;
    line-height: 1.45;
  }
  .empty-banner .btn {
    margin-left: auto;
    height: 32px;
  }
  .tl-body {
    flex: 1;
    min-height: 0;
    padding: 0 8px 0 10px;
  }
  .detail-col {
    padding: 20px;
    border-radius: 18px;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .ph-hint {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border-radius: 14px;
    border: 1px dashed var(--line);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .ph-hint strong {
    color: var(--text);
  }
  .monthview {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 22px 22px;
  }

  /* ---------- phone ---------- */
  .phone {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    --tl-bg: var(--bg);
  }
  .ph-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: calc(var(--safe-top) + 14px) 16px 0 20px;
  }
  .ph-date {
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .ph-sub {
    font-size: 13px;
    font-weight: 550;
    color: var(--muted);
  }
  .ph-title {
    font-size: 27px;
    font-weight: 750;
    letter-spacing: -0.025em;
  }
  .ph-actions {
    display: flex;
    gap: 6px;
  }
  .round {
    width: 44px !important;
    height: 44px !important;
    border-radius: 22px;
  }
  .ph-week {
    display: grid;
    grid-template-columns: 22px repeat(7, minmax(0, 1fr)) 22px;
    gap: 3px;
    padding: 14px 8px 4px;
    align-items: center;
  }
  .wkbtn {
    height: 60px;
    border: none;
    background: transparent;
    color: var(--faint);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .wday {
    height: 60px;
    border: none;
    border-radius: 16px;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--text);
    transition: background 0.15s ease;
  }
  .wday span {
    font-size: 11px;
    font-weight: 550;
    opacity: 0.8;
  }
  .wday strong {
    font-size: 16px;
    font-weight: 650;
  }
  .wday.past {
    color: var(--muted);
  }
  .wday.sel {
    background: var(--sunken);
  }
  .wday.today {
    background: var(--accent);
    color: var(--accent-text);
  }
  .ph-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: calc(160px + var(--safe-bottom));
    overscroll-behavior: contain;
  }
  .ph-pad {
    padding: 10px 16px 0;
  }
  .ph-tlhead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 18px 20px 4px;
  }
  .ph-tlhead h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 680;
  }
  .ph-tlhead span {
    font-size: 12px;
    color: var(--muted);
  }
  .ph-tl {
    padding: 0 8px 0 4px;
  }
  .earlier {
    width: 100%;
    height: 36px;
    border: 1px dashed var(--line);
    border-radius: 12px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 4px;
  }
  .empty {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.45;
  }
  .empty strong {
    color: var(--text);
    font-size: 15px;
  }
  .empty .btn {
    align-self: flex-start;
    margin-top: 6px;
  }
  .fab {
    position: absolute;
    right: 18px;
    bottom: calc(96px + var(--safe-bottom));
    width: 60px;
    height: 60px;
    border-radius: 30px;
    border: none;
    background: var(--accent);
    color: var(--accent-text);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow);
    z-index: 10;
    transition: transform 0.12s ease;
  }
  .fab:active {
    transform: scale(0.93);
  }
  .tabs {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 6px 20px calc(8px + var(--safe-bottom));
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-top: 1px solid var(--line);
    z-index: 9;
  }
  .tabs button {
    position: relative;
    height: 54px;
    border: none;
    background: transparent;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 550;
  }
  .tabs button.on {
    color: var(--accent);
    font-weight: 650;
  }
  .tabs em {
    position: absolute;
    top: 4px;
    left: calc(50% + 6px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--now);
    color: #fff;
    font-size: 10px;
    font-style: normal;
    font-weight: 750;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qa-sheet,
  .inbox {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .qa-sheet h2,
  .inbox h2 {
    margin: 4px 0 0;
    font-size: 20px;
    letter-spacing: -0.02em;
  }
  .inbox p {
    margin: -6px 0 0;
    font-size: 13px;
  }
  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .examples span:not(.label) {
    font-size: 12.5px;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--sunken);
    color: var(--muted);
  }
</style>

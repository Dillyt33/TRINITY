<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { disablePush, enablePush, pushState, testPush, type PushState } from '../lib/push';
  import { DEFAULT_NOTIFY, type NotifySettings } from '../lib/types';

  let devState = $state<PushState | 'loading'>('loading');
  let working = $state(false);

  const notify = $derived<NotifySettings>({ ...DEFAULT_NOTIFY, ...app.settings.notify });
  const synced = $derived(app.mode === 'firebase' && !!app.user);

  onMount(async () => {
    devState = await pushState().catch(() => 'unsupported' as const);
  });

  function set(patch: Partial<NotifySettings>) {
    app.setSettings({ notify: { ...notify, ...patch } });
  }

  async function token() {
    const t = await app.firebase?.idToken();
    if (!t) throw new Error('sign_in_required');
    return t;
  }

  async function turnOn() {
    working = true;
    try {
      await enablePush(await token());
      devState = 'on';
      app.flash('Notifications are on for this device');
    } catch (e) {
      const msg = (e as Error).message;
      devState = await pushState().catch(() => 'unsupported' as const);
      app.flash(
        msg === 'denied'
          ? 'Notifications were blocked. You can allow them in Settings → Notifications → Trinity.'
          : msg === 'push_not_configured'
            ? 'Trinity’s server isn’t set up for notifications yet (docs/REMINDERS.md).'
            : 'Couldn’t turn on notifications. Try again.',
      );
    } finally {
      working = false;
    }
  }

  async function turnOff() {
    working = true;
    try {
      await disablePush(await token());
      devState = 'off';
    } finally {
      working = false;
    }
  }

  async function test() {
    working = true;
    try {
      const r = await testPush(await token());
      app.flash(r.delivered ? `Sent a test to ${r.delivered} device${r.delivered === 1 ? '' : 's'}` : 'No devices got it. Turn notifications off and on again.');
    } catch {
      app.flash('Couldn’t send a test.');
    } finally {
      working = false;
    }
  }

  const leads = [5, 10, 15];
</script>

<section>
  <div class="label">Reminders & check-ins</div>

  <div class="device">
    <Icon name="bell" size={16} />
    {#if !synced}
      <span>Reminders need the synced version of Trinity and its server. See docs/REMINDERS.md.</span>
    {:else if devState === 'loading'}
      <span>Checking this device…</span>
    {:else if devState === 'needs-install'}
      <span>On iPhone, add Trinity to your Home Screen first (Share → Add to Home Screen), open it from there, then turn this on.</span>
    {:else if devState === 'unsupported'}
      <span>This browser can’t show notifications. Use the installed app on your iPhone, or Safari/Chrome on your Mac.</span>
    {:else if devState === 'denied'}
      <span>Notifications are blocked for Trinity. Allow them in iPhone Settings → Notifications → Trinity (or your browser’s site settings).</span>
    {:else if devState === 'off'}
      <span class="grow">Off on this device.</span>
      <button class="btn primary" disabled={working} onclick={turnOn}>Turn on</button>
    {:else}
      <span class="grow"><strong>On</strong> for this device.</span>
      <button class="btn" disabled={working} onclick={test}>Send a test</button>
      <button class="btn ghost" disabled={working} onclick={turnOff}>Turn off</button>
    {/if}
  </div>

  <div class="rows">
    <label class="row">
      <input type="checkbox" checked={notify.blockReminders} onchange={(e) => set({ blockReminders: e.currentTarget.checked })} />
      <span class="grow">Remind me before each block</span>
      <select class="field small" value={notify.leadMinutes} disabled={!notify.blockReminders} onchange={(e) => set({ leadMinutes: Number(e.currentTarget.value) })} aria-label="How many minutes before">
        {#each leads as m (m)}<option value={m}>{m} min before</option>{/each}
      </select>
    </label>
    <label class="row">
      <input type="checkbox" checked={notify.checkIns} onchange={(e) => set({ checkIns: e.currentTarget.checked })} />
      <span class="grow">Ask how it went when a block ends</span>
    </label>
    {#each [['morning', 'Morning check-in'], ['midday', 'Midday “how are you doing?”'], ['evening', 'Evening check-in']] as [key, label] (key)}
      {@const k = key as 'morning' | 'midday' | 'evening'}
      <label class="row">
        <input type="checkbox" checked={notify[k] !== null} onchange={(e) => set({ [k]: e.currentTarget.checked ? DEFAULT_NOTIFY[k] : null })} />
        <span class="grow">{label}</span>
        <input class="field small" type="time" value={notify[k] ?? ''} disabled={notify[k] === null} onchange={(e) => e.currentTarget.value && set({ [k]: e.currentTarget.value })} aria-label="{label} time" />
      </label>
    {/each}
    <div class="row">
      <span class="grow">Quiet hours (no block reminders)</span>
      <input class="field small" type="time" value={notify.quietStart} onchange={(e) => e.currentTarget.value && set({ quietStart: e.currentTarget.value })} aria-label="Quiet hours start" />
      <span class="to">to</span>
      <input class="field small" type="time" value={notify.quietEnd} onchange={(e) => e.currentTarget.value && set({ quietEnd: e.currentTarget.value })} aria-label="Quiet hours end" />
    </div>
  </div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .device {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--sunken);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .device :global(svg) {
    flex: none;
  }
  .device span {
    flex: 1 1 200px;
  }
  .device strong {
    color: var(--text);
  }
  .device .btn {
    height: 34px;
  }
  .grow {
    flex: 1;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    border-bottom: 1px solid var(--line);
    font-size: 14px;
    flex-wrap: wrap;
  }
  .row:last-child {
    border-bottom: none;
  }
  .row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--accent);
  }
  .small {
    width: auto;
    padding: 6px 8px;
    font-size: 13px;
  }
  .to {
    color: var(--muted);
    font-size: 13px;
  }
</style>

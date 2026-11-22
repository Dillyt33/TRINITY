<script lang="ts">
  import { onMount } from 'svelte';
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { apiBase } from '../lib/connector';

  let { requestId }: { requestId: string } = $props();

  let info = $state<{ clientName: string; redirectHost: string } | null>(null);
  let status = $state<'loading' | 'ready' | 'working' | 'done' | 'error'>('loading');
  let message = $state('');

  onMount(async () => {
    if (app.mode !== 'firebase') {
      status = 'error';
      message = 'Connecting Claude needs the synced version of Trinity (Firebase). See docs/SETUP.md.';
      return;
    }
    try {
      const r = await fetch(`${apiBase()}/api/oauth/request/${encodeURIComponent(requestId)}`);
      if (!r.ok) throw new Error('expired');
      info = await r.json();
      status = 'ready';
    } catch {
      status = 'error';
      message = 'This request has expired. Go back to Claude and choose Connect again.';
    }
  });

  async function decide(allow: boolean) {
    status = 'working';
    try {
      const token = await app.firebase?.idToken();
      const r = await fetch(`${apiBase()}/api/oauth/${allow ? 'approve' : 'deny'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ request: requestId }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        status = 'error';
        message =
          r.status === 403
            ? 'This Google account isn’t allowed to connect Trinity. Sign in with your own account (Settings → Sign out), then try again from Claude.'
            : r.status === 404
              ? 'This request has expired. Go back to Claude and choose Connect again.'
              : 'Something went wrong. Try connecting again from Claude.';
        return;
      }
      status = 'done';
      window.location.href = body.redirect;
    } catch {
      status = 'error';
      message = 'Couldn’t reach Trinity’s server. Check your connection and try again.';
    }
  }
</script>

<div class="wrap">
  <div class="card box fade-up">
    <div class="logos">
      <Logo size={44} />
      <span class="link"><Icon name="arrow-right" size={16} /></span>
      <span class="claude"><Icon name="sparkle" size={22} /></span>
    </div>

    {#if status === 'loading'}
      <p class="muted">Loading…</p>
    {:else if status === 'error'}
      <h1>Can’t connect</h1>
      <p class="muted">{message}</p>
      <a class="btn" href="/">Open Trinity</a>
    {:else if status === 'done'}
      <h1>Connected</h1>
      <p class="muted">Taking you back to {info?.clientName ?? 'Claude'}…</p>
    {:else}
      <h1>Let {info?.clientName ?? 'Claude'} use Trinity?</h1>
      <p class="muted">Trinity will be able to work with your calendar from {info?.clientName ?? 'Claude'}, including by voice:</p>
      <ul>
        <li><Icon name="check" size={14} stroke={2.2} />See your time blocks, intentions and to-dos</li>
        <li><Icon name="check" size={14} stroke={2.2} />Add, move, finish and remove blocks and to-dos</li>
      </ul>
      {#if app.user}
        <p class="who">Signed in as <strong>{app.user.email}</strong></p>
      {/if}
      <div class="acts">
        <button class="btn" disabled={status === 'working'} onclick={() => decide(false)}>Cancel</button>
        <button class="btn primary" disabled={status === 'working'} onclick={() => decide(true)}>{status === 'working' ? 'Connecting…' : 'Allow'}</button>
      </div>
      <p class="fine">You can disconnect any time in Claude’s settings. It goes back to {info?.redirectHost ?? 'claude.ai'}.</p>
    {/if}
  </div>
</div>

<style>
  .wrap {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(24px + var(--safe-top)) 20px calc(24px + var(--safe-bottom));
  }
  .box {
    width: min(420px, 100%);
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .logos {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }
  .link {
    color: var(--faint);
    display: inline-flex;
  }
  .claude {
    width: 44px;
    height: 44px;
    border-radius: 13px;
    background: var(--sunken);
    color: #d97757;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  h1 {
    margin: 4px 0 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .muted {
    margin: 0;
    color: var(--muted);
    line-height: 1.5;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--sunken);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13.5px;
  }
  li {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  li :global(svg) {
    color: var(--accent);
    flex: none;
    margin-top: 2px;
  }
  .who {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .acts {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 8px;
    margin-top: 4px;
  }
  .acts .btn {
    height: 46px;
    border-radius: 13px;
  }
  .fine {
    margin: 0;
    font-size: 12px;
    color: var(--faint);
  }
</style>

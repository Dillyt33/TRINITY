<script lang="ts">
  import { fly } from 'svelte/transition';
  import { app } from '../lib/app.svelte';

  let { bottom = 24 }: { bottom?: number } = $props();
</script>

{#if app.toast}
  {#key app.toast.id}
    <div class="toast" role="status" style="bottom: calc({bottom}px + var(--safe-bottom))" in:fly={{ y: 16, duration: 220 }} out:fly={{ y: 16, duration: 160 }}>
      <span>{app.toast.msg}</span>
      {#if app.toast.action}
        <button
          onclick={() => {
            app.toast?.action?.run();
            app.toast = null;
          }}>{app.toast.action.label}</button
        >
      {/if}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 80;
    display: flex;
    align-items: center;
    gap: 14px;
    max-width: calc(100vw - 32px);
    padding: 10px 10px 10px 16px;
    border-radius: 14px;
    background: var(--text);
    color: var(--bg);
    font-size: 13.5px;
    font-weight: 550;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  }
  .toast span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    border: none;
    background: color-mix(in srgb, var(--bg) 14%, transparent);
    color: inherit;
    font-weight: 750;
    padding: 6px 10px;
    border-radius: 8px;
  }
</style>

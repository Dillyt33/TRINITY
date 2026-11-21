<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let { open, onclose, label, children }: { open: boolean; onclose: () => void; label: string; children: Snippet } = $props();

  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 821px)').matches;
  let dy = $state(0);
  let openedAt = 0;
  $effect(() => {
    if (open) openedAt = Date.now();
  });
  // Ignore the click from the same tap that opened the sheet.
  function backdropClick() {
    if (Date.now() - openedAt > 350) onclose();
  }
  let startY = $state<number | null>(null);

  function down(e: PointerEvent) {
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
  }
  function up() {
    if (startY === null) return;
    startY = null;
    if (dy > 110) onclose();
    dy = 0;
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) onclose();
  }
</script>

<svelte:window onkeydown={key} />

{#if open}
  <div class="backdrop" transition:fade={{ duration: 180 }} onclick={backdropClick} role="presentation"></div>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={label}
    style="transform: translateY({dy}px); transition: {startY === null ? 'transform .25s var(--ease)' : 'none'}"
    transition:fly={desktop ? { y: 16, duration: 200, easing: cubicOut } : { y: 420, duration: 320, easing: cubicOut, opacity: 1 }}
  >
    <div class="handle" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="presentation">
      <span></span>
    </div>
    <div class="content">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.42);
    z-index: 60;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: calc(100dvh - var(--safe-top) - 40px);
    z-index: 61;
    background: var(--surface);
    border-radius: 26px 26px 0 0;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
  }
  .handle {
    display: flex;
    justify-content: center;
    padding: 9px 0 6px;
    touch-action: none;
    cursor: grab;
  }
  .handle span {
    width: 38px;
    height: 5px;
    border-radius: 3px;
    background: var(--line);
  }
  .content {
    overflow-y: auto;
    padding: 4px 20px calc(20px + var(--safe-bottom));
    overscroll-behavior: contain;
  }
  @media (min-width: 821px) {
    .sheet {
      left: 50%;
      right: auto;
      bottom: auto;
      top: 8vh;
      width: min(560px, calc(100vw - 48px));
      margin-left: calc(min(560px, calc(100vw - 48px)) / -2);
      max-height: 84vh;
      border-radius: 22px;
    }
    .handle {
      display: none;
    }
    .content {
      padding: 22px 24px 24px;
    }
  }
</style>

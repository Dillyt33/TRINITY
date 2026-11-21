<script lang="ts">
  let { size = 30 }: { size?: number } = $props();
</script>

<span class="logo" style="width:{size}px;height:{size}px;border-radius:{size * 0.3}px;padding:0 {size * 0.23}px;gap:{size * 0.1}px" aria-hidden="true">
  <span style="height:{size * 0.13}px;width:100%"></span>
  <span style="height:{size * 0.13}px;width:65%;opacity:.7"></span>
  <span style="height:{size * 0.13}px;width:85%;opacity:.45"></span>
</span>

<style>
  .logo {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    background: var(--accent);
    flex: none;
  }
  .logo span {
    display: block;
    border-radius: 2px;
    background: var(--accent-text);
  }
</style>

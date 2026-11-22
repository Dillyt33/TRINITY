<script lang="ts">
  type Name =
    | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'check' | 'plus' | 'clock' | 'cloud' | 'cloud-off'
    | 'calendar' | 'list' | 'inbox' | 'mic' | 'sparkle' | 'trash' | 'arrow-right' | 'settings' | 'x'
    | 'grip' | 'target' | 'copy' | 'upload' | 'sun' | 'moon' | 'bell' | 'user' | 'logout' | 'speaker' | 'speaker-off';

  let { name, size = 16, stroke = 1.7 }: { name: Name; size?: number; stroke?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'chevron-left'}<path d="M10 3.5 5.5 8l4.5 4.5" />
  {:else if name === 'chevron-right'}<path d="M6 3.5 10.5 8 6 12.5" />
  {:else if name === 'chevron-down'}<path d="M3.5 6 8 10.5 12.5 6" />
  {:else if name === 'check'}<path d="M3.5 8.5l3 3 6-7" />
  {:else if name === 'plus'}<path d="M8 3v10M3 8h10" />
  {:else if name === 'x'}<path d="M4 4l8 8M12 4l-8 8" />
  {:else if name === 'clock'}<circle cx="8" cy="8" r="6.2" /><path d="M8 4.8V8l2.2 1.4" />
  {:else if name === 'cloud'}<path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6a2.5 2.5 0 0 0 .3 4.9z" /><path d="M6.3 9.6l1.3 1.2 2.3-2.5" />
  {:else if name === 'cloud-off'}<path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6a2.5 2.5 0 0 0 .3 4.9z" /><path d="M2 2l12 12" />
  {:else if name === 'calendar'}<rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  {:else if name === 'list'}<path d="M3 4h10M3 8h7M3 12h9" />
  {:else if name === 'inbox'}<path d="M2 9.5l1.8-6h8.4l1.8 6v3.5H2z" /><path d="M2 9.5h3.5l1 1.5h3l1-1.5H14" />
  {:else if name === 'mic'}<rect x="5.5" y="1.8" width="5" height="8" rx="2.5" /><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
  {:else if name === 'sparkle'}<path d="M8 1.2l1.7 4.6 4.6 1.7-4.6 1.7L8 13.8 6.3 9.2 1.7 7.5l4.6-1.7z" fill="currentColor" stroke="none" />
  {:else if name === 'trash'}<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  {:else if name === 'arrow-right'}<path d="M3 8h10M9 4l4 4-4 4" />
  {:else if name === 'settings'}<circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v1.7M8 12.8v1.7M14.5 8h-1.7M3.2 8H1.5M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2M12.6 12.6l-1.2-1.2M4.6 4.6 3.4 3.4" />
  {:else if name === 'grip'}<circle cx="6" cy="4" r=".9" fill="currentColor" /><circle cx="10" cy="4" r=".9" fill="currentColor" /><circle cx="6" cy="8" r=".9" fill="currentColor" /><circle cx="10" cy="8" r=".9" fill="currentColor" /><circle cx="6" cy="12" r=".9" fill="currentColor" /><circle cx="10" cy="12" r=".9" fill="currentColor" />
  {:else if name === 'target'}<circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.4" />
  {:else if name === 'copy'}<rect x="5" y="5" width="8.5" height="8.5" rx="1.8" /><path d="M10.5 5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4A1.3 1.3 0 0 0 3.8 10.5H5" />
  {:else if name === 'upload'}<path d="M8 10.5V2.5M4.8 5.5 8 2.3l3.2 3.2M2.5 10.5v2.2c0 .5.4.8.8.8h9.4c.4 0 .8-.3.8-.8v-2.2" />
  {:else if name === 'sun'}<circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" />
  {:else if name === 'moon'}<path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" />
  {:else if name === 'bell'}<path d="M4 11.5V7.2a4 4 0 0 1 8 0v4.3l1.2 1.2H2.8zM6.5 14h3" />
  {:else if name === 'user'}<circle cx="8" cy="5.5" r="2.8" /><path d="M2.8 14a5.2 5.2 0 0 1 10.4 0" />
  {:else if name === 'speaker'}<path d="M2.5 6v4h2.6L8.5 13V3L5.1 6z" /><path d="M10.8 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.8a6 6 0 0 1 0 8.4" />
  {:else if name === 'speaker-off'}<path d="M2.5 6v4h2.6L8.5 13V3L5.1 6z" /><path d="M11 6l3 4M14 6l-3 4" />
  {:else if name === 'logout'}<path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6" />
  {/if}
</svg>

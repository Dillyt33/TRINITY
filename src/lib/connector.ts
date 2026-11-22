/** Where Trinity's server lives. Same address as the app unless VITE_TRINITY_API_URL says otherwise. */
export function apiBase(): string {
  const env = (import.meta.env.VITE_TRINITY_API_URL as string | undefined)?.replace(/\/$/, '');
  return env || window.location.origin;
}

/** The address you paste into Claude → Settings → Connectors → Add custom connector. */
export function connectorUrl(): string {
  return `${apiBase()}/mcp`;
}

/** The /connect?request=… page that Claude's sign-in sends you to. */
export function connectRequestId(): string | null {
  if (typeof window === 'undefined' || window.location.pathname !== '/connect') return null;
  return new URLSearchParams(window.location.search).get('request');
}

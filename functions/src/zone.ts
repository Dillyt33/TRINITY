/** Date and time "now" in the person's own time zone (the server runs in UTC). */
export function nowIn(tz: string, at = new Date()): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    return nowIn('UTC', at);
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const date = `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`;
  return { date, minutes: (get('hour') % 24) * 60 + get('minute') };
}

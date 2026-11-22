import Anthropic from '@anthropic-ai/sdk';
import personaFile from '../../assistant/trinity-instructions.md';
import { timeRange } from '../../src/lib/time';
import { describeDay, type DayContext, type Notice, type Reminder, type Writer } from './reminders';

/** Trinity's personality from assistant/trinity-instructions.md, without the editing notes and the blank "About me" template. */
export function personaText(profile: string): string {
  const body = personaFile.split(/\n---\n/).slice(1).join('\n---\n') || personaFile;
  const withoutTemplate = body.replace(/## About me \(fill this in\)[\s\S]*$/, '').trim();
  return profile.trim() ? `${withoutTemplate}\n\n## About me\n${profile.trim()}` : withoutTemplate;
}

const ASK: Record<Reminder['kind'], string> = {
  upnext: 'Remind me that this block starts in a few minutes. Give me one concrete nudge to start well.',
  blockcheck: 'This block just ended. Ask how it went, briefly. If it matters to my goals, say why in a few words.',
  morning: 'Morning check-in: one line on what matters today, then ask how I am feeling.',
  midday: 'Midday check-in: ask how I am doing. Be honest about progress so far, warm if I am behind.',
  evening: 'Evening check-in: ask how today went. Acknowledge what got done; no lecture.',
};

/** Claude writes the notification in Trinity's voice. */
export class ClaudeWriter implements Writer {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  }

  async write(r: Reminder, ctx: DayContext, fallback: Notice): Promise<Notice> {
    const block = r.block ? `The block: ${r.block.title}, ${timeRange(r.block.start, r.block.end)}, category ${r.block.cat}.` : '';
    const response = await this.client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      // If Claude declines (rare), the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system:
        personaText(ctx.profile) +
        '\n\n## Right now\nYou are writing ONE phone notification from Trinity. Reply with exactly two lines and nothing else:\n' +
        'Line 1: a title, at most 40 characters.\nLine 2: the message, at most 140 characters.\n' +
        'No quotes, emoji, hashtags or markdown. Be specific to my day; never generic motivation.',
      messages: [{ role: 'user', content: `${ASK[r.kind]}\n${block}\n\n${describeDay(ctx)}` }],
    });
    if (response.stop_reason !== 'end_turn') return fallback;
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    const [title, ...rest] = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const body = rest.join(' ');
    if (!title || !body) return fallback;
    return { ...fallback, title: title.slice(0, 60), body: body.slice(0, 220) };
  }
}

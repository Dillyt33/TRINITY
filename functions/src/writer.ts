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
  morning: 'Morning check-in: one line on what matters today, and ask how I slept or how I am feeling.',
  midday: 'Midday check-in: ask how I am doing. Be honest about progress so far, warm if I am behind. Maybe ask about food or energy.',
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
        '\n\n## Right now\nYou are texting me ONE short message as Trinity, like a real person would. It shows as a phone notification from "Trinity" and opens our chat. ' +
        'Reply with the message only: one or two sentences, at most 160 characters. No quotes, emoji, hashtags or markdown. ' +
        'Be specific to my day and what I have told you; never generic motivation.',
      messages: [{ role: 'user', content: `${ASK[r.kind]}\n${block}\n\n${describeDay(ctx)}` }],
    });
    if (response.stop_reason !== 'end_turn') return fallback;
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    const body = text.split('\n').map((s) => s.trim()).filter(Boolean).join(' ').replace(/^["“]|["”]$/g, '');
    if (!body) return fallback;
    return { ...fallback, body: body.slice(0, 240) };
  }
}

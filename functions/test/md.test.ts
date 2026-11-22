import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('persona file', () => {
  it('keeps the parts the notification writer relies on', () => {
    const md = readFileSync(new URL('../../assistant/trinity-instructions.md', import.meta.url), 'utf8');
    expect(md).toContain('\n---\n');
    expect(md).toContain('## About me (fill this in)');
    expect(md).toContain('You are Trinity');
  });
});

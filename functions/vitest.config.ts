import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Load .md files as text, the same way the esbuild bundle does.
  plugins: [
    {
      name: 'markdown-as-text',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('.md')) return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: { include: ['test/**/*.test.ts'] },
});

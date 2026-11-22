import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // npm packages are installed by Firebase at deploy time; our own code (and ../src/lib) is bundled.
  packages: 'external',
  loader: { '.md': 'text' },
  logLevel: 'info',
});

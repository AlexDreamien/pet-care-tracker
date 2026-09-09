/**
 * Compiles the API into one JavaScript file so production can start with plain `node`.
 *
 * The server used to run through `tsx`, which strips types on every boot. On a development
 * machine that costs a few seconds; on a shared vCPU with a cold page cache it took minutes,
 * during which the deployed instance answered 502 and logged nothing at all. Type-stripping
 * belongs in the build, which happens once, not in the boot, which happens on every deploy
 * and every wake from a stopped machine.
 *
 * Only our own code is bundled. Everything from node_modules stays external and is imported
 * at runtime — `better-sqlite3`, `sharp` and `@node-rs/argon2` are native addons that cannot
 * be inlined, and bundling the rest would buy nothing.
 *
 * This does not typecheck. `npm run typecheck` does, and CI runs it.
 *
 * Usage: node tools/bundle.mjs
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { stat } from 'node:fs/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bundle the workspace, import everything else.
 *
 * `@pet-care-tracker/core` and `@pet-care-tracker/catalog` resolve to TypeScript sources —
 * Node cannot load those, so they have to come along. Any other bare specifier is a real
 * package that will be installed beside the output.
 */
const externalDependencies = {
  name: 'external-dependencies',
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      if (args.path.startsWith('.') || args.path.startsWith('/')) return null;
      if (args.path.startsWith('@pet-care-tracker/')) return null;
      return { path: args.path, external: true };
    });
  },
};

const outfile = join(root, 'apps/api/build/server.js');

await build({
  entryPoints: [join(root, 'apps/api/src/index.ts')],
  outfile,
  bundle: true,
  plugins: [externalDependencies],
  platform: 'node',
  format: 'esm',
  // Matches the runtime in the Dockerfile and the floor in package.json engines.
  target: 'node22',
  // A stack trace from a bundle is unreadable without one. The server is started with
  // --enable-source-maps so it is actually used.
  sourcemap: true,
  logLevel: 'warning',
});

const { size } = await stat(outfile);
console.log(`${relative(root, outfile)} — ${Math.round(size / 1024)} KiB`);

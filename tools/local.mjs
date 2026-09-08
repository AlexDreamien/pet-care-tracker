/**
 * Runs the whole application the way production does: one process, one origin, the built
 * front end served by the API.
 *
 * `npm run dev` is two servers and a proxy, which is convenient but not what ships. This is
 * the shape to check before deploying, and what `tools/capture.mjs` points at.
 *
 * Usage: npm run build && node tools/local.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '5199';

const child = spawn(
  process.execPath,
  [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'apps/api/src/index.ts')],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      HOST: process.env.HOST ?? '127.0.0.1',
      PORT: port,
      DATABASE_PATH: process.env.DATABASE_PATH ?? './.local/db.sqlite',
      UPLOAD_DIR: process.env.UPLOAD_DIR ?? './.local/uploads',
      PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`,
      WEB_DIST: process.env.WEB_DIST ?? './apps/web/dist',
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));

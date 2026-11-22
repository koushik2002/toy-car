import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = 55000 + (process.pid % 10000);
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port });
try {
  await server.start();
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl, TEST_DATABASE_ISOLATED: '1' },
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await server.stop();
  await db.close();
}

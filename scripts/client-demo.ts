import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataDir = resolve(process.env.CLIENT_DEMO_DATA_DIR || '.local/client-demo-db');
await mkdir(dataDir, { recursive: true });
process.env.LOCAL_DATABASE_DIR = dataDir;
process.env.PUBLIC_BROWSING ??= '1';

await import('./dev-local.js');

// Signs every local review account in once and saves its cookies, so tests start signed in.
import { mkdir } from 'node:fs/promises';
import { request, type FullConfig } from '@playwright/test';
import { localReviewPassword } from '../../scripts/local-review-accounts';

import { authFile, type Account } from './helpers';

const accounts: Record<Account, string> = {
  collector: 'collector@tinykars.local',
  seller: 'seller@tinykars.local',
  superadmin: 'superadmin@tinykars.local',
  admin: 'admin@tinykars.local',
  staff: 'staff@tinykars.local',
};

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  await mkdir('test-results/.auth', { recursive: true });
  await mkdir('artifacts/final-qa', { recursive: true });
  for (const [name, email] of Object.entries(accounts) as [Account, string][]) {
    const context = await request.newContext({ baseURL });
    const response = await context.post('/api/auth/login', {
      headers: { Origin: baseURL },
      data: { email, password: localReviewPassword },
    });
    if (!response.ok())
      throw new Error(`Sign-in for ${email} failed: ${response.status()} ${await response.text()}`);
    await context.storageState({ path: authFile(name) });
    await context.dispose();
  }
}

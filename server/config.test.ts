import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

const development = {
  DATABASE_URL: 'postgresql://localhost/tinykars_test',
  PUBLIC_WEB_URL: 'http://localhost:5173',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  OUTBOX_ENCRYPTION_KEY: '11'.repeat(32),
};

describe('payment environment safety', () => {
  it('enables the safe payment adapter only outside production', () => {
    expect(readConfig({ ...development, PAYMENT_TEST_MODE: '1' }).paymentTestMode).toBe(true);
    expect(() =>
      readConfig({
        ...development,
        NODE_ENV: 'production',
        PUBLIC_WEB_URL: 'https://tinykars.example',
        ALLOWED_ORIGINS: 'https://tinykars.example',
        RESEND_API_KEY: 'test-only-key',
        EMAIL_FROM: 'Tiny Kars <test@example.com>',
        PAYMENT_TEST_MODE: '1',
      }),
    ).toThrow('PAYMENT_TEST_MODE cannot be enabled in production.');
  });
});

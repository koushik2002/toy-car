export interface ServerConfig {
  databaseUrl: string;
  port: number;
  production: boolean;
  allowedOrigins: string[];
  publicWebUrl: string;
  outboxEncryptionKey: string;
  resendApiKey?: string;
  emailFrom?: string;
  mediaPublicBaseUrl?: string;
  r2Endpoint?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  /** Local/staging checkout adapter. It is rejected when NODE_ENV=production. */
  paymentTestMode?: boolean;
  metaWhatsAppToken?: string;
  metaWhatsAppPhoneNumberId?: string;
  metaWhatsAppTemplateName?: string;
  metaWhatsAppTemplateLanguage?: string;
  metaGraphApiVersion?: string;
  tallyConnectorSecret?: string;
  /** Lets signed-out visitors browse the catalogue. Off until the client decides (login-first). */
  publicBrowsing?: boolean;
}

export function readConfig(env = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const publicWebUrl = env.PUBLIC_WEB_URL || (production ? '' : 'http://localhost:5173');
  if (!publicWebUrl) throw new Error('PUBLIC_WEB_URL is required.');
  const origin = new URL(publicWebUrl).origin;
  if (production && !origin.startsWith('https://'))
    throw new Error('Production website URL must use HTTPS.');
  const allowedOrigins = (env.ALLOWED_ORIGINS || origin)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin))
    throw new Error('PUBLIC_WEB_URL must be in ALLOWED_ORIGINS.');
  if (production && allowedOrigins.some((value) => !value.startsWith('https://')))
    throw new Error('Production origins must use HTTPS.');
  const outboxEncryptionKey = env.OUTBOX_ENCRYPTION_KEY || '';
  if (!/^[a-f\d]{64}$/i.test(outboxEncryptionKey))
    throw new Error('OUTBOX_ENCRYPTION_KEY must be 64 hex characters.');
  if (production && (!env.RESEND_API_KEY || !env.EMAIL_FROM))
    throw new Error('Email provider and sender are required for production account access.');
  const mediaValues = [
    env.MEDIA_PUBLIC_BASE_URL,
    env.R2_ENDPOINT,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
    env.R2_BUCKET,
  ];
  if (mediaValues.some(Boolean) && !mediaValues.every(Boolean))
    throw new Error('All R2 media settings must be configured together.');
  if (production && env.MEDIA_PUBLIC_BASE_URL && !env.MEDIA_PUBLIC_BASE_URL.startsWith('https://'))
    throw new Error('Production media URL must use HTTPS.');
  const razorpayValues = [
    env.RAZORPAY_KEY_ID,
    env.RAZORPAY_KEY_SECRET,
    env.RAZORPAY_WEBHOOK_SECRET,
  ];
  if (razorpayValues.some(Boolean) && !razorpayValues.every(Boolean))
    throw new Error('All Razorpay credentials must be configured together.');
  const paymentTestMode = env.PAYMENT_TEST_MODE === '1';
  if (production && paymentTestMode)
    throw new Error('PAYMENT_TEST_MODE cannot be enabled in production.');
  const whatsappValues = [
    env.META_WHATSAPP_TOKEN,
    env.META_WHATSAPP_PHONE_NUMBER_ID,
    env.META_WHATSAPP_TEMPLATE_NAME,
  ];
  if (whatsappValues.some(Boolean) && !whatsappValues.every(Boolean))
    throw new Error('All Meta WhatsApp settings must be configured together.');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid.');
  return {
    databaseUrl,
    port,
    production,
    allowedOrigins,
    publicWebUrl,
    outboxEncryptionKey,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    mediaPublicBaseUrl: env.MEDIA_PUBLIC_BASE_URL,
    r2Endpoint: env.R2_ENDPOINT,
    r2AccessKeyId: env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
    r2Bucket: env.R2_BUCKET,
    razorpayKeyId: env.RAZORPAY_KEY_ID,
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    paymentTestMode,
    metaWhatsAppToken: env.META_WHATSAPP_TOKEN,
    metaWhatsAppPhoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID,
    metaWhatsAppTemplateName: env.META_WHATSAPP_TEMPLATE_NAME,
    metaWhatsAppTemplateLanguage: env.META_WHATSAPP_TEMPLATE_LANGUAGE || 'en',
    metaGraphApiVersion: env.META_GRAPH_API_VERSION || 'v24.0',
    tallyConnectorSecret: env.TALLY_CONNECTOR_SECRET,
    publicBrowsing: env.PUBLIC_BROWSING === '1',
  };
}

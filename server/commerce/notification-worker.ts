import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ServerConfig } from '../config.js';

interface Job {
  id: string;
  order_id: string;
  kind: 'payment_confirmed' | 'whatsapp_payment_confirmed' | 'order_shipped' | 'order_delivered';
  attempts: number;
}

function rupees(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

type EmailOrder = {
  id: string;
  order_number: string;
  total_paise: number;
  name: string;
  courier: string;
  tracking_number: string;
};

function orderEmail(kind: Job['kind'], value: EmailOrder, link: string) {
  if (kind === 'order_shipped') {
    const tracking = [value.courier, value.tracking_number && `tracking ${value.tracking_number}`]
      .filter(Boolean)
      .join(', ');
    return {
      subject: `Your Tiny Kars order ${value.order_number} is on its way`,
      text: `Hello ${value.name},\n\nGood news: your order ${value.order_number} has been shipped${tracking ? ` (${tracking})` : ''}.\n\nFollow its journey: ${link}\n\nThank you,\nTiny Kars`,
    };
  }
  if (kind === 'order_delivered')
    return {
      subject: `Your Tiny Kars order ${value.order_number} was delivered`,
      text: `Hello ${value.name},\n\nYour order ${value.order_number} has been delivered. We hope it looks great on your shelf.\n\nSomething not right? You can request a return from your order page: ${link}\n\nThank you,\nTiny Kars`,
    };
  return {
    subject: `Tiny Kars payment confirmed — ${value.order_number}`,
    text: `Hello ${value.name},\n\nWe received your payment of ${rupees(value.total_paise)}. Your order number is ${value.order_number}.\n\nView your order: ${link}\n\nThank you,\nTiny Kars`,
  };
}

export async function sendOrderConfirmations(
  pool: Pool,
  config: ServerConfig,
  transport: typeof fetch = fetch,
) {
  const availableKinds: Job['kind'][] = [];
  if (config.resendApiKey && config.emailFrom)
    availableKinds.push('payment_confirmed', 'order_shipped', 'order_delivered');
  if (
    config.metaWhatsAppToken &&
    config.metaWhatsAppPhoneNumberId &&
    config.metaWhatsAppTemplateName
  )
    availableKinds.push('whatsapp_payment_confirmed');
  if (!availableKinds.length) return 0;
  const leaseOwner = randomUUID();
  const claimed = await pool.query<Job>(
    `UPDATE commerce_notification_outbox SET status='processing',attempts=attempts+1,
       lease_until=now()+interval '2 minutes',lease_owner=$1
     WHERE id IN (
       SELECT id FROM commerce_notification_outbox
       WHERE kind=ANY($2::text[]) AND ((status='pending' AND available_at<=now())
          OR (status='processing' AND lease_until<now()))
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5
     ) RETURNING id,order_id,kind,attempts`,
    [leaseOwner, availableKinds],
  );
  for (const job of claimed.rows) {
    try {
      const order = await pool.query<
        EmailOrder & {
          status: string;
          email: string;
          phone: string;
        }
      >(
        `SELECT o.id,o.order_number,o.status,o.total_paise,u.email,u.name,o.courier,o.tracking_number,
           COALESCE(o.address_snapshot->>'phone','') AS phone
         FROM commerce_orders o JOIN identity_users u ON u.id=o.customer_id
         WHERE o.id=$1 AND o.channel='online'`,
        [job.order_id],
      );
      if (
        !order.rowCount ||
        !['paid', 'processing', 'shipped', 'out_for_delivery', 'delivered'].includes(
          order.rows[0].status,
        )
      ) {
        await pool.query(
          `UPDATE commerce_notification_outbox SET status='failed',lease_until=NULL,
           lease_owner=NULL,last_error='order_not_paid' WHERE id=$1 AND lease_owner=$2`,
          [job.id, leaseOwner],
        );
        continue;
      }
      const value = order.rows[0];
      const link = new URL(`/account/orders/${value.id}`, config.publicWebUrl).toString();
      const response =
        job.kind !== 'whatsapp_payment_confirmed'
          ? await transport('https://api.resend.com/emails', {
              method: 'POST',
              signal: AbortSignal.timeout(15000),
              headers: {
                Authorization: `Bearer ${config.resendApiKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': job.id,
              },
              body: JSON.stringify({
                from: config.emailFrom,
                to: [value.email],
                ...orderEmail(job.kind, value, link),
              }),
            })
          : value.phone
            ? await transport(
                `https://graph.facebook.com/${config.metaGraphApiVersion || 'v24.0'}/${config.metaWhatsAppPhoneNumberId}/messages`,
                {
                  method: 'POST',
                  signal: AbortSignal.timeout(15000),
                  headers: {
                    Authorization: `Bearer ${config.metaWhatsAppToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: value.phone.replace(/\D/g, ''),
                    type: 'template',
                    template: {
                      name: config.metaWhatsAppTemplateName,
                      language: { code: config.metaWhatsAppTemplateLanguage || 'en' },
                      components: [
                        {
                          type: 'body',
                          parameters: [
                            { type: 'text', text: value.name },
                            { type: 'text', text: value.order_number },
                            { type: 'text', text: rupees(value.total_paise) },
                            { type: 'text', text: link },
                          ],
                        },
                      ],
                    },
                  }),
                },
              )
            : new Response('{}', { status: 422 });
      if (!response.ok) throw new Error(`provider_http_${response.status}`);
      const result = (await response.json()) as { id?: string; messages?: { id?: string }[] };
      await pool.query(
        `UPDATE commerce_notification_outbox SET status='sent',sent_at=now(),
         lease_until=NULL,lease_owner=NULL,provider_id=$2,last_error=NULL
         WHERE id=$1 AND status='processing' AND lease_owner=$3`,
        [job.id, result.id || result.messages?.[0]?.id || null, leaseOwner],
      );
    } catch (error) {
      const code =
        error instanceof Error && /^provider_http_\d{3}$/.test(error.message)
          ? error.message
          : error instanceof Error && error.name === 'TimeoutError'
            ? 'provider_timeout'
            : 'delivery_error';
      await pool.query(
        `UPDATE commerce_notification_outbox SET status=$2,
         available_at=now()+($3::integer * interval '1 minute'),
         lease_until=NULL,lease_owner=NULL,last_error=$5
         WHERE id=$1 AND status='processing' AND lease_owner=$4`,
        [
          job.id,
          job.attempts >= 8 ? 'failed' : 'pending',
          Math.min(60, 2 ** job.attempts),
          leaseOwner,
          code,
        ],
      );
    }
  }
  return claimed.rowCount ?? 0;
}

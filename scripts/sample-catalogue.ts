// Fills a local or staging database with the demo's 60 cars, each with five labelled sample views,
// so every screen can be reviewed before Gopal Sagar's real catalogue and photographs arrive.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { nextProductCode, nextUnitCodes } from '../server/catalogue/series-codes.js';

type DemoProduct = {
  name: string;
  brand: string;
  series: string;
  scale: string;
  condition: string;
  price: number;
  mrp: number;
  stock: number;
  threshold: number;
  rare: boolean;
  image: string;
  description: string;
  arrival: number;
  sold: number;
  offer?: string;
};

/** Sample photos all live under this folder; it is also how samples are found and withdrawn. */
export const sampleImagePrefix = 'assets/products/samples/';
const offerNames: Record<string, string> = { bundle: 'Starter Garage', b2g1: 'Collector Trio' };
const viewNames = [
  'front three-quarter',
  'rear three-quarter',
  'side detail',
  'front detail',
  'roof and interior',
];

export async function seedSampleCatalogue(pool: pg.Pool, ownerId: string) {
  const products = JSON.parse(
    await readFile(new URL('../src/data/products.json', import.meta.url), 'utf8'),
  ) as DemoProduct[];
  const client = await pool.connect();
  const ids: string[] = [];
  try {
    await client.query('BEGIN');
    for (const [index, item] of products.entries()) {
      const id = randomUUID();
      ids.push(id);
      const car = /car-(\d+)\.webp$/.exec(item.image)?.[1] ?? '0';
      const sku = await nextProductCode(client, item.brand, item.series);
      // Older "arrival" values become older creation dates so "newest" sorting matches the demo.
      const createdAt = new Date(Date.now() - (100 - item.arrival) * 6 * 3600 * 1000);
      await client.query(
        `INSERT INTO catalogue_products
          (id,sku,name,brand,series,manufacture_year,scale,condition,price_paise,mrp_paise,
           available,rare,popularity_score,description,offer,serial_tracking,low_stock_threshold,
           variant_group,variant_label,published_at,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
        [
          id,
          sku,
          item.name,
          item.brand,
          item.series,
          2017 + (index % 9),
          item.scale,
          item.condition,
          item.price * 100,
          Math.max(item.mrp, item.price) * 100,
          item.stock,
          item.rare,
          item.sold,
          item.description.replace('Demo artwork is illustrative', 'Sample photographs'),
          item.offer ? offerNames[item.offer] || null : null,
          item.rare,
          item.threshold,
          `sample:${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          [item.brand, item.series, item.scale, item.condition].filter(Boolean).join(' · '),
          createdAt,
        ],
      );
      for (const [slot, view] of viewNames.entries())
        await client.query(
          `INSERT INTO catalogue_product_images(product_id,slot,url,alt) VALUES($1,$2,$3,$4)`,
          [
            id,
            slot + 1,
            `${sampleImagePrefix}car-${car}-view-${slot + 1}.webp`,
            `${item.name}, ${view} (sample photo)`,
          ],
        );
      if (item.stock > 0) {
        await client.query(
          `INSERT INTO inventory_movements(id,product_id,delta,after_available,reason,source_key,actor_id)
           VALUES($1,$2,$3,$3,'Opening stock (sample catalogue)',$4,$5)`,
          [randomUUID(), id, item.stock, `sample:${id}`, ownerId],
        );
        // Rare pieces demonstrate per-car serial labels.
        if (item.rare)
          for (const code of await nextUnitCodes(client, item.brand, item.series, item.stock))
            await client.query(
              'INSERT INTO inventory_units(id,product_id,serial_code) VALUES($1,$2,$3)',
              [randomUUID(), id, code],
            );
      }
    }
    // Demo shop rules: ₹79 delivery, free from ₹1,499, and the TINY10 code. Only if none exist.
    await client.query(
      `INSERT INTO commerce_shipping_policies(id,mode,base_paise,free_above_paise,created_by,active,activated_at)
       SELECT $1,'flat',7900,149900,$2,true,now()
        WHERE NOT EXISTS (SELECT 1 FROM commerce_shipping_policies WHERE active)`,
      [randomUUID(), ownerId],
    );
    await client.query(
      `INSERT INTO commerce_vouchers(id,code,kind,value,minimum_subtotal_paise,use_scope,expires_at,created_by)
       VALUES
        ($1,'TINY10','percent',1000,49900,'once_per_customer',now()+interval '1 year',$3),
        ($2,'DEMO10','percent',1000,49900,'once_per_customer',now()+interval '1 year',$3)
       ON CONFLICT (code) DO NOTHING`,
      [randomUUID(), randomUUID(), ownerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return ids;
}

/** Adds a few past orders for one customer so order history, tracking and the dashboard have data. */
export async function seedSampleOrders(pool: pg.Pool, customerId: string, productIds: string[]) {
  const address = {
    recipientName: 'Local Collector',
    phone: '9876500001',
    line1: '12 MG Road',
    line2: 'Near the clock tower',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
  };
  await pool.query(
    `INSERT INTO customer_addresses(id,customer_id,recipient_name,phone,line1,line2,city,state,postal_code,is_default)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
    [
      randomUUID(),
      customerId,
      address.recipientName,
      address.phone,
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postalCode,
    ],
  );
  const plans = [
    {
      status: 'delivered',
      daysAgo: 3,
      items: [0, 4],
      steps: ['paid', 'processing', 'shipped', 'delivered'],
    },
    { status: 'shipped', daysAgo: 2, items: [2], steps: ['paid', 'processing', 'shipped'] },
    { status: 'processing', daysAgo: 1, items: [7, 9, 11], steps: ['paid', 'processing'] },
    { status: 'paid', daysAgo: 0, items: [5], steps: ['paid'] },
  ];
  for (const plan of plans) {
    const id = randomUUID();
    const placed = new Date(Date.now() - plan.daysAgo * 86400000 - 3600000);
    const products = await pool.query<{
      id: string;
      sku: string;
      name: string;
      price_paise: number;
    }>('SELECT id,sku,name,price_paise FROM catalogue_products WHERE id=ANY($1::uuid[])', [
      plan.items.map((index) => productIds[index]),
    ]);
    const subtotal = products.rows.reduce((sum, row) => sum + row.price_paise, 0);
    const shipping = subtotal >= 149900 ? 0 : 7900;
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,shipping_paise,tax_paise,
        discount_paise,total_paise,address_snapshot,created_at,paid_at,delivered_at,courier,tracking_number,
        delivery_recipient)
       VALUES($1,$2,'online',$3,$4,$5,0,0,$6,$7,$8,$8,$9,$10,$11,$12)`,
      [
        id,
        customerId,
        plan.status,
        subtotal,
        shipping,
        subtotal + shipping,
        JSON.stringify(address),
        placed,
        plan.status === 'delivered' ? new Date(placed.getTime() + 2 * 86400000) : null,
        plan.steps.includes('shipped') ? 'Blue Dart' : '',
        plan.steps.includes('shipped') ? `BD${String(placed.getTime()).slice(-8)}` : '',
        plan.status === 'delivered' ? 'Local Collector' : '',
      ],
    );
    for (const row of products.rows)
      await pool.query(
        `INSERT INTO commerce_order_items(id,order_id,product_id,sku,name,quantity,unit_price_paise,line_total_paise)
         VALUES($1,$2,$3,$4,$5,1,$6,$6)`,
        [randomUUID(), id, row.id, row.sku, row.name, row.price_paise],
      );
    for (const [step, status] of plan.steps.entries())
      await pool.query(
        `INSERT INTO commerce_order_events(id,order_id,status,note,created_at) VALUES($1,$2,$3,$4,$5)`,
        [
          randomUUID(),
          id,
          status,
          status === 'shipped' ? 'Blue Dart · sample tracking' : '',
          new Date(placed.getTime() + step * 12 * 3600000),
        ],
      );
  }
}

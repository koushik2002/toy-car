import { getState, transact, uid } from './storage';
import { queueSync } from './tallySync';
import type { Product } from '../types';
export function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('Unclosed quote in CSV.');
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const columns = [
  'sku',
  'name',
  'brand',
  'series',
  'scale',
  'condition',
  'price',
  'mrp',
  'stock',
  'threshold',
  'rare',
];
const escape = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
export function exportProducts() {
  return [
    columns.join(','),
    ...getState().products.map((p) => columns.map((k) => escape(p[k as keyof Product])).join(',')),
  ].join('\n');
}
export function importProducts(text: string) {
  const rows = parseCSV(text);
  const header = rows.shift()?.map((h) => h.trim().replace(/^\uFEFF/, ''));
  if (!header || columns.some((c) => !header.includes(c)))
    throw Error(`CSV needs these columns: ${columns.join(', ')}. Export a template first.`);
  const known = new Set<string>();
  const products = rows.map((row, i) => {
    const obj = Object.fromEntries(header.map((h, j) => [h, row[j]?.trim() ?? '']));
    if (!obj.sku || !obj.name || !obj.brand || known.has(obj.sku))
      throw Error(`Row ${i + 2}: missing name/brand/SKU or duplicate SKU.`);
    known.add(obj.sku);
    for (const k of ['price', 'mrp', 'stock', 'threshold'])
      if (obj[k] === '' || !Number.isFinite(Number(obj[k])) || Number(obj[k]) < 0)
        throw Error(`Row ${i + 2}: invalid ${k}.`);
    if (!Number.isInteger(Number(obj.stock)) || !Number.isInteger(Number(obj.threshold)))
      throw Error(`Row ${i + 2}: stock and threshold must be whole numbers.`);
    if (!['New', 'Pre-owned', 'Card damaged'].includes(obj.condition))
      throw Error(`Row ${i + 2}: invalid condition.`);
    if (!['1:64', '1:43', '1:32', '1:24', '1:18'].includes(obj.scale))
      throw Error(`Row ${i + 2}: invalid scale.`);
    if (!['true', 'false'].includes(obj.rare.toLowerCase()))
      throw Error(`Row ${i + 2}: rare must be true or false.`);
    const old = getState().products.find((p) => p.sku === obj.sku);
    return {
      ...old,
      id: old?.id ?? uid('p'),
      sku: obj.sku,
      name: obj.name,
      brand: obj.brand,
      series: obj.series,
      scale: obj.scale,
      condition: obj.condition,
      price: Number(obj.price),
      mrp: Number(obj.mrp),
      stock: Number(obj.stock),
      threshold: Number(obj.threshold),
      rare: obj.rare.toLowerCase() === 'true',
      image: old?.image ?? 'assets/products/car-0.webp',
      color: old?.color ?? '#ec252f',
      description: old?.description ?? 'Imported collector model. Demo artwork is illustrative.',
      arrival: Date.now(),
      sold: old?.sold ?? 0,
    } as Product;
  });
  if (!products.length) throw Error('CSV contains no products.');
  transact((d) => {
    products.forEach((p) => {
      const idx = d.products.findIndex((x) => x.sku === p.sku);
      const before = idx >= 0 ? d.products[idx].stock : 0;
      if (idx >= 0) d.products[idx] = p;
      else d.products.push(p);
      d.movements.unshift({
        id: uid('move'),
        productId: p.id,
        sku: p.sku,
        before,
        after: p.stock,
        reason: 'CSV import',
        who: 'Tiny Kars Admin',
        at: new Date().toISOString(),
      });
      queueSync(d, 'Stock Adjustment', p.sku, p.id, p.stock);
      d.tally.mapping[p.id] ??= `${p.brand} ${p.name}`;
    });
  });
  return products.length;
}
export function downloadFile(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

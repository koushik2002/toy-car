// Builds five labelled placeholder views per demo car until Gopal Sagar's real photographs arrive.
// Output: public/assets/products/samples/car-<n>-view-<1..5>.webp
// The label sits above the bottom edge so it survives the 4:3 crop used by product cards.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const source = (car: number) => `public/assets/products/car-${car}.webp`;
const output = 'public/assets/products/samples';
const size = 660;
// Each view is a different framing of the one demo photo; labels match the agreed view order.
const views = [
  { label: 'FRONT THREE-QUARTER', frame: null, flop: false },
  { label: 'REAR THREE-QUARTER', frame: null, flop: true },
  { label: 'SIDE DETAIL', frame: { left: 300, top: 220, width: 340, height: 340 }, flop: false },
  { label: 'FRONT DETAIL', frame: { left: 20, top: 250, width: 330, height: 330 }, flop: false },
  {
    label: 'ROOF & INTERIOR',
    frame: { left: 150, top: 140, width: 380, height: 380 },
    flop: false,
  },
] as const;

function stamp(text: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect x="16" y="${size - 140}" rx="6" width="${text.length * 10.4 + 30}" height="34" fill="rgba(10,13,18,.72)"/>
    <text x="30" y="${size - 117}" font-family="Arial, Helvetica, sans-serif" font-size="14"
      font-weight="700" letter-spacing="1.2" fill="#ffdc49">${text.replaceAll('&', '&amp;')}</text>
  </svg>`);
}

await mkdir(output, { recursive: true });
for (let car = 0; car < 9; car += 1) {
  for (const [index, view] of views.entries()) {
    let image = sharp(source(car));
    if (view.frame) image = image.extract(view.frame);
    if (view.flop) image = image.flop();
    const framed = await image.resize(size, size, { fit: 'cover' }).toBuffer();
    await sharp(framed)
      .composite([{ input: stamp(`SAMPLE PHOTO · ${view.label}`), top: 0, left: 0 }])
      .webp({ quality: 82 })
      .toFile(`${output}/car-${car}-view-${index + 1}.webp`);
  }
}
process.stdout.write(`Wrote ${9 * views.length} sample views to ${output}\n`);

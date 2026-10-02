import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
await sharp('public/assets/hero.webp')
  .resize(1100)
  .webp({ quality: 80 })
  .toFile('public/assets/hero-mobile.webp');
for (let i = 0; i < 9; i++)
  await sharp(`public/assets/products/car-${i}.webp`)
    .resize(360)
    .webp({ quality: 80 })
    .toFile(`public/assets/products/car-${i}-small.webp`);
const logo = await readFile('public/assets/brand/logo.png');
await writeFile(
  'public/assets/brand/logo.png',
  await sharp(logo).resize(320).png({ palette: true }).toBuffer(),
);

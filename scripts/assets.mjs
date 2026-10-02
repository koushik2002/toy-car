import sharp from 'sharp';
import { readFile, writeFile, unlink } from 'node:fs/promises';
await sharp('public/assets/hero-original.png')
  .resize({ width: 1600 })
  .webp({ quality: 83 })
  .toFile('public/assets/hero.webp');
const file = 'public/assets/catalogue-original.png';
const meta = await sharp(file).metadata(),
  w = Math.floor(meta.width / 3),
  h = Math.floor(meta.height / 3);
for (let i = 0; i < 9; i++)
  await sharp(file)
    .extract({ left: (i % 3) * w, top: Math.floor(i / 3) * h, width: w, height: h })
    .resize(660, 660)
    .webp({ quality: 85 })
    .toFile(`public/assets/products/car-${i}.webp`);
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="200" viewBox="0 0 520 200"><path d="M12 57 Q50 95 105 71L481 18 497 78 113 139Q53 143 12 57" fill="#eb2731"/><text x="108" y="87" font-size="83" font-weight="900" font-family="Arial" font-style="italic" fill="#ffdf3c" transform="rotate(-7 108 87)">TINY</text><path d="M102 118L483 77 468 170 100 197Z" fill="#0a0d12" stroke="#159bed" stroke-width="6"/><text x="122" y="176" font-size="85" font-weight="900" font-family="Arial" font-style="italic" fill="white" transform="rotate(-7 122 176)">KARS</text><path d="M35 83L75 98 40 108 88 109 58 126 112 114 83 90Z" fill="#ffdf3c"/></svg>`;
await sharp(Buffer.from(logo)).resize(520, 200).png().toFile('public/assets/brand/logo.png');
await writeFile('public/assets/brand/logo-placeholder.svg', logo);
// Original generation outputs remain in Codex's image archive; only web-optimised assets ship.
await unlink('public/assets/hero-original.png');
await unlink(file);

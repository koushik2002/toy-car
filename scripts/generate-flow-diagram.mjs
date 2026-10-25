import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const out = new URL('../docs/', import.meta.url);
const esc = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const arrow = (d, dashed = false) =>
  `<path d="${d}" fill="none" stroke="${dashed ? '#f9c65d' : '#ef4b55'}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" ${dashed ? 'stroke-dasharray="10 9"' : ''} marker-end="url(#arrow${dashed ? 'Amber' : 'Red'})"/>`;
function card({ x, y, w = 390, h = 235, number, kicker, title, lines, accent = '#ef4b55', note }) {
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#18212d" stroke="#374451" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="${w}" height="7" rx="3" fill="${accent}"/>
    <circle cx="${x + 44}" cy="${y + 49}" r="24" fill="${accent}"/>
    <text x="${x + 44}" y="${y + 57}" text-anchor="middle" class="num">${esc(number)}</text>
    <text x="${x + 82}" y="${y + 43}" class="kicker">${esc(kicker)}</text>
    <text x="${x + 30}" y="${y + 101}" class="card-title">${esc(title)}</text>
    ${lines.map((line, i) => `<text x="${x + 30}" y="${y + 140 + i * 28}" class="body">${esc(line)}</text>`).join('')}
    ${note ? `<text x="${x + 30}" y="${y + h - 23}" class="note">${esc(note)}</text>` : ''}
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1150" viewBox="0 0 1920 1150" role="img" aria-label="Tiny Kars current sales and billing flow">
<defs>
  <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0b111a"/><stop offset="1" stop-color="#121b28"/></linearGradient>
  <linearGradient id="rule"><stop stop-color="#ef4b55"/><stop offset="1" stop-color="#f9c65d"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#05080e" flood-opacity=".5"/></filter>
  <marker id="arrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ef4b55"/></marker>
  <marker id="arrowAmber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#f9c65d"/></marker>
</defs>
<style>
  .eyebrow{font:700 22px Arial,sans-serif;letter-spacing:5px;fill:#f9c65d}
  .headline{font:800 78px Arial,sans-serif;letter-spacing:-2px;fill:#fff}
  .subtitle{font:400 29px Arial,sans-serif;fill:#b7c2d2}
  .num{font:800 23px Arial,sans-serif;fill:#111925}
  .kicker{font:700 20px Arial,sans-serif;letter-spacing:2px;fill:#b8c8d6}
  .card-title{font:800 29px Arial,sans-serif;fill:#fff}
  .body{font:400 22px Arial,sans-serif;fill:#d4deea}
  .note{font:700 19px Arial,sans-serif;fill:#f9c65d}
  .footer-title{font:800 25px Arial,sans-serif;fill:#fff}
  .footer-body{font:400 21px Arial,sans-serif;fill:#c4d0dd}
</style>
<rect width="1920" height="1150" fill="url(#bg)"/>
<path d="M0 20L1920 20M0 1120L1920 1120" stroke="#253649" stroke-width="2"/>
<path d="M70 70H420" stroke="url(#rule)" stroke-width="8" stroke-linecap="round"/>
<text x="70" y="115" class="eyebrow">TINY KARS  /  CURRENT PROTOTYPE</text>
<text x="70" y="203" class="headline">WhatsApp to billing flow</text>
<text x="72" y="248" class="subtitle">What the GitHub Pages demo actually saves, sends and deducts</text>
${card({ x: 70, y: 320, number: '01', kicker: 'COLLECTOR', title: 'Browse & select', lines: ['Explore catalogue products', 'and add models to the cart.'], note: 'Products live in this browser.' })}
${card({ x: 535, y: 320, number: '02', kicker: 'CHECKOUT', title: 'Save local request', lines: ['Validate stock and address.', 'Deduct demo stock now.'], note: 'This happens before WhatsApp Send.' })}
${card({ x: 1000, y: 320, number: '03', kicker: 'WHATSAPP', title: 'Customer taps Send', lines: ['A prefilled message opens.', 'Customer sends it manually.'], note: 'Opening a link does not send it.' })}
${card({ x: 1465, y: 320, number: '04', kicker: 'SHOP CHAT', title: 'Agree the sale', lines: ['Shop confirms availability,', 'delivery and payment in chat.'], note: 'No payment gateway.' })}
${arrow('M460 438H515')}${arrow('M925 438H980')}${arrow('M1390 438H1445')}
${card({ x: 70, y: 690, number: 'A', kicker: 'ADMIN CATALOGUE', title: 'Add or import products', lines: ['Edit items or import CSV.', 'Changes stay in local storage.'], accent: '#66c7df', note: 'No shared database.' })}
${card({ x: 535, y: 690, number: 'B', kicker: 'STOCK + TALLY', title: 'Demo stock & jobs', lines: ['Checkout or bill queues', 'simulated sales/stock jobs.'], accent: '#66c7df', note: 'No real Tally connection.' })}
${card({ x: 1000, y: 690, number: 'C', kicker: 'REQUEST BILLING', title: 'Generate saved bill', lines: ['Admin opens the request,', 'then prints or saves PDF.'], accent: '#66c7df', note: 'No second stock deduction.' })}
${card({ x: 1465, y: 690, number: 'D', kicker: 'SEPARATE PATH', title: 'Standalone bill', lines: ['Select catalogue models.', 'Save bill + deduct stock.'], accent: '#f9c65d', note: 'Rejects missing or insufficient stock.' })}
${arrow('M265 690V575')}${arrow('M730 555V670')}${arrow('M1660 555V620H1195V670')}
${arrow('M1660 925V962H730V938', true)}
<rect x="70" y="1000" width="1780" height="96" rx="18" fill="#202c39" stroke="#405061"/>
<circle cx="112" cy="1048" r="16" fill="#f9c65d"/>
<text x="148" y="1041" class="footer-title">Browser-only demo</text>
<text x="148" y="1073" class="footer-body">Requests, bills and stock are not shared across devices. No sales-report download or customer shipment tracking.</text>
</svg>`;

await writeFile(new URL('toy-car-current-flow.svg', out), svg);
await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile(new URL('toy-car-current-flow.png', out).pathname);

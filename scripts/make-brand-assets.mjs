// Regenerates the typographic brand assets: favicon.svg, favicon.ico,
// apple-touch-icon.png and the 1200x630 social card. Output is committed, so this
// only needs to run when the name, palette or focus line changes.
//   pnpm brand:assets
//
// The tab icon is the typographic "FR" monogram on purpose: a photograph is
// unreadable at 16 px and is not good favicon practice.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './lib/content-files.mjs';

const pub = (name) => join(ROOT, 'public', name);
const font = (name) => readFileSync(join(ROOT, 'src/assets/fonts', name)).toString('base64');

const GREEN = '#2d5a46';
const PAPER = '#f7f6f2';
const INK = '#202722';
const MUTED = '#5a655e';

// Geometric "FR" built from strokes so it renders identically without any font.
const monogram = `<rect width="64" height="64" rx="12" fill="${GREEN}"/>
  <g fill="none" stroke="${PAPER}" stroke-width="6" stroke-linejoin="miter">
    <path d="M17 50V17H30M17 31H27"/>
    <path d="M37 50V17H44A7 7 0 0 1 44 31H37M44 31L51 50"/>
  </g>`;
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  ${monogram}\n</svg>\n`;
writeFileSync(pub('favicon.svg'), faviconSvg);

const socialHtml = `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${font('inter-latin-wght-normal.woff2')}); }
  @font-face { font-family: Newsreader; font-weight: 200 800; src: url(data:font/woff2;base64,${font('newsreader-latin-wght-normal.woff2')}); }
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; background: ${PAPER}; display: flex; flex-direction: column; justify-content: center; padding: 0 96px; box-sizing: border-box; border-left: 18px solid ${GREEN}; }
  .name { font: 600 84px/1.1 Inter; color: ${INK}; letter-spacing: -0.02em; }
  .role { margin-top: 28px; font: 500 44px/1.25 Newsreader; color: ${GREEN}; }
  .focus { margin-top: 44px; padding-top: 32px; border-top: 2px solid #d9dfd9; font: 400 30px/1.4 Inter; color: ${MUTED}; max-width: 900px; }
</style>
<div class="name">Md. Fazle Rabbi Rahat</div>
<div class="role">AI research · Kennesaw State University</div>
<div class="focus">Multimodal AI, retrieval, and reliable human-AI decision support</div>`;

const iconHtml = (size) => `<!doctype html><style>html,body{margin:0;background:${GREEN}}svg{display:block;width:${size}px;height:${size}px}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${monogram}</svg>`;

const browser = await chromium.launch();
try {
  const shot = async (html, width, height) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png', omitBackground: false });
    await page.close();
    return png;
  };

  writeFileSync(pub('social/default.png'), await shot(socialHtml, 1200, 630));
  writeFileSync(pub('apple-touch-icon.png'), await shot(iconHtml(180), 180, 180));

  // favicon.ico: one 32x32 PNG image inside an ICO container.
  const png32 = await shot(iconHtml(32), 32, 32);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(32, 6); // width
  header.writeUInt8(32, 7); // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png32.length, 14); // image size
  header.writeUInt32LE(22, 18); // image offset
  writeFileSync(pub('favicon.ico'), Buffer.concat([header, png32]));
} finally {
  await browser.close();
}

// The 192 px photo icon from the portrait experiment is no longer used.
rmSync(pub('icon-192.png'), { force: true });

console.log('Wrote favicon.svg, favicon.ico, apple-touch-icon.png and social/default.png');

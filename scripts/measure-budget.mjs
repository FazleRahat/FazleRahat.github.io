// Measures what a first visit to each page actually transfers, against the budgets
// in BUDGET below, plus layout shift while fonts swap in.
// Text assets are measured gzipped (what GitHub Pages sends); binaries as-is.
// Serves dist/ itself on a spare port; run `pnpm build` first.
//   pnpm measure
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { ROOT } from './lib/content-files.mjs';

const PORT = 4391;
const server = spawn('node', ['scripts/serve-dist.mjs', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 800));

const BUDGET = { homeKB: 600, jsGzipKB: 20, cssGzipKB: 35, fontKB: 160, cls: 0.1 };
const routes = ['/', '/research/', '/publications/', '/teaching/', '/about/', '/cv/'];
const kb = (bytes) => (bytes / 1024).toFixed(1);
const isText = (type) => /html|css|javascript|json|xml|svg|text/.test(type);

const browser = await chromium.launch();
const rows = [];
let failed = false;

try {
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const totals = { html: 0, css: 0, js: 0, font: 0, image: 0, other: 0 };
    page.on('response', async (response) => {
      try {
        const type = response.headers()['content-type'] ?? '';
        const body = await response.body();
        const size = isText(type) ? gzipSync(body).length : body.length;
        const bucket = type.includes('html') ? 'html' : type.includes('css') ? 'css' : type.includes('javascript') ? 'js' : type.includes('font') ? 'font' : type.includes('image') ? 'image' : 'other';
        totals[bucket] += size;
        // Module scripts inlined in the HTML count toward JS, not HTML.
        if (bucket === 'html') {
          const inline = [...body.toString().matchAll(/<script(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('');
          const inlineGzip = inline ? gzipSync(Buffer.from(inline)).length : 0;
          totals.js += inlineGzip;
          totals.html -= inlineGzip;
        }
      } catch {
        /* redirects and aborted requests have no body */
      }
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const cls = await page.evaluate(() => window.__cls);
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    rows.push({ route, ...totals, total, cls });
    if (route === '/' && total / 1024 > BUDGET.homeKB) failed = true;
    if (totals.js / 1024 > BUDGET.jsGzipKB || totals.css / 1024 > BUDGET.cssGzipKB || totals.font / 1024 > BUDGET.fontKB || cls > BUDGET.cls) failed = true;
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(`Budgets: home < ${BUDGET.homeKB} KB, JS < ${BUDGET.jsGzipKB} KB gzip, CSS < ${BUDGET.cssGzipKB} KB gzip, fonts < ${BUDGET.fontKB} KB`);
console.log('route'.padEnd(42), 'html'.padStart(7), 'css'.padStart(7), 'js'.padStart(7), 'fonts'.padStart(7), 'images'.padStart(7), 'total'.padStart(8), 'CLS'.padStart(7));
for (const row of rows) {
  console.log(
    row.route.padEnd(42),
    kb(row.html).padStart(7),
    kb(row.css).padStart(7),
    kb(row.js).padStart(7),
    kb(row.font).padStart(7),
    kb(row.image + row.other).padStart(7),
    kb(row.total).padStart(8),
    row.cls.toFixed(4).padStart(7),
  );
}
console.log('(sizes in KB; text gzipped, fonts/images as served; mobile viewport 390px)');
if (failed) {
  console.error('A budget was exceeded.');
  process.exit(1);
}

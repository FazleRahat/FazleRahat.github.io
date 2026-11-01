// Inspects a built site (dist/ by default) for broken internal links and assets,
// leaked drafts or planning material, placeholder text, metadata problems and
// bibliography/PDF integrity. Exits non-zero when anything is wrong.
//
//   pnpm check:output
//   node scripts/check-output.mjs --dist dist-subpath     (uses SITE_ENV / SITE_ORIGIN / SITE_BASE
//                                                          exactly as the build that produced it did)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { parse as parseBibtex } from '@retorquere/bibtex-parser';
import { resolveSiteConfig } from '../site.config.mjs';
import { ROOT, loadRawContent } from './lib/content-files.mjs';

const distFlag = process.argv.indexOf('--dist');
const distArg = distFlag > -1 ? process.argv[distFlag + 1] : 'dist';
const DIST = isAbsolute(distArg) ? distArg : join(ROOT, distArg);
const site = resolveSiteConfig(process.env);
const content = loadRawContent();

const problems = [];
const problem = (where, message) => problems.push(`${where}: ${message}`);

if (!existsSync(DIST)) {
  console.error(`No build output at ${relative(ROOT, DIST)}. Run pnpm build first.`);
  process.exit(1);
}

// --- Collect files --------------------------------------------------------------
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const files = walk(DIST);
const rel = (file) => relative(DIST, file).split(sep).join('/');
const fileSet = new Set(files.map(rel));
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const routeOfFile = (file) => {
  const path = rel(file);
  if (path === 'index.html') return '/';
  if (path.endsWith('/index.html')) return `/${path.slice(0, -'index.html'.length)}`;
  return `/${path}`;
};

// --- Link and asset resolution ----------------------------------------------------
const idsByFile = new Map();
const pages = htmlFiles.map((file) => {
  const html = readFileSync(file, 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  idsByFile.set(rel(file), new Set(ids));
  return { file, path: rel(file), route: routeOfFile(file), html, ids };
});

function targetFile(pathname) {
  const clean = pathname.startsWith(site.base) ? pathname.slice(site.base.length) : null;
  if (clean === null) return null;
  if (clean === '' || clean.endsWith('/')) return `${clean}index.html`;
  return clean;
}

function checkInternal(page, rawUrl, attribute) {
  let url;
  try {
    url = new URL(rawUrl, `${site.origin}${site.base}${page.path.replace(/index\.html$/, '')}`);
  } catch {
    problem(page.path, `unparseable ${attribute} "${rawUrl}"`);
    return;
  }
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return;
  if (url.origin !== site.origin) {
    if (url.protocol !== 'https:') problem(page.path, `${attribute} "${rawUrl}" is not https`);
    return;
  }
  const absoluteForm = /^https?:/i.test(rawUrl);
  if (!absoluteForm && rawUrl.startsWith('/') && !rawUrl.startsWith(site.base)) {
    problem(page.path, `${attribute} "${rawUrl}" ignores the base path ${site.base}`);
    return;
  }
  const target = targetFile(url.pathname);
  if (target === null) {
    problem(page.path, `${attribute} "${rawUrl}" is outside the base path ${site.base}`);
    return;
  }
  if (!fileSet.has(target)) {
    problem(page.path, `${attribute} "${rawUrl}" does not resolve to a built file (${target})`);
    return;
  }
  if (url.hash.length > 1 && target.endsWith('.html')) {
    const id = decodeURIComponent(url.hash.slice(1));
    if (!idsByFile.get(target)?.has(id)) problem(page.path, `${attribute} "${rawUrl}" points to a missing anchor #${id}`);
  }
}

for (const page of pages) {
  const urls = [];
  for (const match of page.html.matchAll(/\s(href|src)=(?:"([^"]*)"|'([^']*)')/g)) urls.push([match[1], match[2] ?? match[3]]);
  for (const match of page.html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const candidate of match[1].split(',')) urls.push(['srcset', candidate.trim().split(/\s+/)[0]]);
  }
  for (const match of page.html.matchAll(/<meta[^>]+(?:property|name)="(?:og|twitter):image"[^>]+content="([^"]*)"/g)) {
    urls.push(['social image', match[1]]);
  }
  for (const [attribute, rawUrl] of urls) {
    if (rawUrl === '#' || rawUrl === '') problem(page.path, `empty or "#" placeholder ${attribute}`);
    else checkInternal(page, rawUrl, attribute);
  }
}

// --- Per-page structure and metadata --------------------------------------------------
const titles = new Map();
const descriptions = new Map();
for (const page of pages) {
  const { html, ids } = page;
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) problem(page.path, `expected exactly one <h1>, found ${h1s}`);

  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of new Set(duplicateIds)) problem(page.path, `duplicate id "${id}"`);

  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) if (!ids.includes(id)) problem(page.path, `aria-labelledby references missing id "${id}"`);
  }

  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  if (!title) problem(page.path, 'missing <title>');
  else titles.set(title, [...(titles.get(title) ?? []), page.path]);

  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!description) problem(page.path, 'missing meta description');
  else descriptions.set(description, [...(descriptions.get(description) ?? []), page.path]);

  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!canonical) problem(page.path, 'missing canonical link');
  else if (!canonical.startsWith(site.origin + site.base)) problem(page.path, `canonical "${canonical}" is not under ${site.origin}${site.base}`);

  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (site.environment === 'production' && noindex && page.path !== '404.html') problem(page.path, 'production page carries noindex');
  if (site.environment !== 'production' && !noindex) problem(page.path, `${site.environment} build must carry noindex`);

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      problem(page.path, `invalid JSON-LD: ${error.message}`);
    }
  }
  const csp = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(html)?.[1];
  if (!csp) problem(page.path, 'missing Content-Security-Policy');
  else if (!csp.includes("default-src 'none'") || /unsafe-(?:inline|eval)/.test(csp)) problem(page.path, 'Content-Security-Policy is weaker than configured');
  if (!/<html lang="en"/.test(html)) problem(page.path, 'missing <html lang="en">');
  if (!/class="skip-link"/.test(html)) problem(page.path, 'missing skip link');
  if (!/<main id="main"/.test(html)) problem(page.path, 'missing <main id="main">');
}
for (const [title, where] of titles) if (where.length > 1) problem(where.join(', '), `duplicate <title> "${title}"`);
for (const [text, where] of descriptions) if (where.length > 1) problem(where.join(', '), `duplicate meta description "${text.slice(0, 40)}…"`);

// --- Leakage and placeholders -------------------------------------------------------------
const FORBIDDEN_TEXT = [
  [/\bTODO\b|\bTBD\b|\bFIXME\b/, 'TODO/TBD/FIXME marker'],
  [/lorem ipsum/i, 'lorem ipsum'],
  [/\bplaceholder\b/i, 'the word "placeholder"'],
  [/example\.(?:com|org|net)/i, 'an example.* domain'],
];
if (site.environment === 'production') FORBIDDEN_TEXT.push([/localhost|127\.0\.0\.1/, 'a localhost URL']);

const textFiles = files.filter((file) => /\.(?:html|xml|txt|bib|css|js|json|svg)$/.test(file));
for (const file of textFiles) {
  // CSP hashes are random base64, which could happen to spell a short forbidden word.
  const text = readFileSync(file, 'utf8').replace(/<meta http-equiv="content-security-policy"[^>]*>/i, '');
  for (const [pattern, label] of FORBIDDEN_TEXT) if (pattern.test(text)) problem(rel(file), `contains ${label}`);
}

const draftResearch = content.research.filter((entry) => entry.data.draft);
const draftPublications = content.publications.filter((record) => record.draft);
for (const entry of draftResearch) {
  if (fileSet.has(`research/${entry.id}/index.html`)) problem(`research/${entry.id}/`, 'draft research record was built');
  for (const file of textFiles) if (readFileSync(file, 'utf8').includes(entry.data.title)) problem(rel(file), `mentions draft research "${entry.data.title}"`);
}
for (const record of draftPublications) {
  for (const file of textFiles) {
    const text = readFileSync(file, 'utf8');
    if (text.includes(record.title) || text.includes(record.citationKey)) problem(rel(file), `mentions draft publication "${record.id}"`);
  }
  if (fileSet.has(`citations/${record.citationKey}.bib`)) problem(`citations/${record.citationKey}.bib`, 'draft publication was exported');
}
for (const record of content.events.filter((event) => event.draft)) {
  for (const file of textFiles) {
    if (readFileSync(file, 'utf8').includes(record.title)) problem(rel(file), `mentions draft event "${record.id}"`);
  }
}
if (!content.site.showPhdAvailability) {
  for (const file of textFiles) {
    if (content.site.availabilityText && readFileSync(file, 'utf8').includes(content.site.availabilityText)) {
      problem(rel(file), 'shows the PhD availability text while showPhdAvailability is false');
    }
  }
}
for (const forbiddenFile of ['design', 'docs', 'node_modules']) {
  if ([...fileSet].some((path) => path.startsWith(`${forbiddenFile}/`))) problem(forbiddenFile, 'private directory contents were published');
}
for (const path of fileSet) if (/\.(?:md|mdx|ts|map)$/.test(path)) problem(path, 'source or planning file in output');

// --- Expected routes, sitemap, robots -----------------------------------------------------------
const publicPublications = content.publications.filter((record) => !record.draft);
const publicEvents = content.events.filter((record) => !record.draft);
const expectedRoutes = [
  '/',
  '/research/',
  '/publications/',
  ...(publicEvents.length > 0 ? ['/events/'] : []),
  '/teaching/',
  '/about/',
  '/cv/',
];
// The events page exists only while there is something to list: no page, and no link to it, otherwise.
if (publicEvents.length === 0) {
  if (fileSet.has(targetFile(`${site.base}events/`))) problem('/events/', 'the events page was built although there are no public events');
  for (const page of pages) {
    if (page.html.includes(`href="${site.base}events/"`)) problem(page.path, 'links to /events/ although there are no public events');
  }
}
// Research has no pages of its own: only /research/ exists, and nothing may link to a page below it.
// (/research/?area=… is the overview itself with one area highlighted, so a query or fragment is fine.)
for (const entry of content.research) {
  if (fileSet.has(`research/${entry.id}/index.html`)) problem(`research/${entry.id}/`, 'research case-study pages were removed, but one was built');
}
const belowResearch = new RegExp(`href="${site.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}research/[^"?#]+[^"]*"`);
for (const page of pages) {
  const link = page.html.match(belowResearch)?.[0];
  if (link) problem(page.path, `links to a research case-study page (${link})`);
}
for (const route of expectedRoutes) if (!fileSet.has(targetFile(site.base + route.slice(1)))) problem(route, 'expected route was not built');
if (!fileSet.has('404.html')) problem('404.html', 'missing');

const sitemapIndex = fileSet.has('sitemap-index.xml') ? readFileSync(join(DIST, 'sitemap-index.xml'), 'utf8') : '';
if (!sitemapIndex) problem('sitemap-index.xml', 'missing');
const sitemapLocs = [...(fileSet.has('sitemap-0.xml') ? readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8') : '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const route of expectedRoutes) {
  const expected = `${site.origin}${site.base}${route.slice(1)}`;
  if (!sitemapLocs.includes(expected)) problem('sitemap-0.xml', `missing ${expected}`);
}
for (const loc of sitemapLocs) {
  if (!loc.startsWith(site.origin + site.base)) problem('sitemap-0.xml', `${loc} is outside ${site.origin}${site.base}`);
  if (loc.includes('/404')) problem('sitemap-0.xml', `${loc} should not be listed`);
}

const robots = fileSet.has('robots.txt') ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
if (site.environment === 'production') {
  if (!robots.includes(`Sitemap: ${site.origin}${site.base}sitemap-index.xml`)) problem('robots.txt', 'does not reference the production sitemap');
} else if (!/Disallow: \//.test(robots) || /Sitemap:/.test(robots)) {
  problem('robots.txt', 'non-production builds must disallow crawling and omit the sitemap');
}

// --- Assets: CV, icons, social card ---------------------------------------------------------------------
const cvPath = content.profile.cv.path.slice(1);
if (!fileSet.has(cvPath)) problem(cvPath, 'CV PDF missing from build');
else {
  const bytes = readFileSync(join(DIST, cvPath));
  if (bytes.subarray(0, 5).toString() !== '%PDF-') problem(cvPath, 'not a PDF');
  if (bytes.length !== content.profile.cv.bytes) problem(cvPath, `size ${bytes.length} differs from manifest ${content.profile.cv.bytes}`);
  if (createHash('sha256').update(bytes).digest('hex') !== content.profile.cv.sha256) problem(cvPath, 'hash differs from manifest');
}
for (const asset of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'social/default.png']) {
  if (!fileSet.has(asset) || statSync(join(DIST, asset)).size === 0) problem(asset, 'missing or empty');
}
for (const font of ['fonts/OFL-Inter.txt', 'fonts/OFL-Newsreader.txt']) if (!fileSet.has(font)) problem(font, 'font licence missing');

// --- Bibliography exports ---------------------------------------------------------------------------------------
const parseBib = (path, expectedKeys) => {
  if (!fileSet.has(path)) return problem(path, 'missing');
  const parsed = parseBibtex(readFileSync(join(DIST, path), 'utf8'));
  if (parsed.errors.length > 0) problem(path, `BibTeX parse errors: ${parsed.errors.map((e) => e.message).join('; ')}`);
  const keys = parsed.entries.map((entry) => entry.key);
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) problem(path, `entries ${JSON.stringify(keys)} differ from expected ${JSON.stringify(expectedKeys)}`);
  return parsed;
};
const canonicalOrder = [...publicPublications].sort((a, b) => b.year - a.year || a.sortOrder - b.sortOrder);
parseBib('publications.bib', canonicalOrder.map((record) => record.citationKey));
for (const record of publicPublications) {
  const parsed = parseBib(`citations/${record.citationKey}.bib`, [record.citationKey]);
  const entry = parsed?.entries[0];
  if (entry) {
    if (entry.fields.doi !== record.doi) problem(`citations/${record.citationKey}.bib`, 'DOI differs from the record');
    if (String(entry.fields.year) !== String(record.year)) problem(`citations/${record.citationKey}.bib`, 'year differs from the record');
    const authors = entry.fields.author.map((author) => author.lastName);
    if (JSON.stringify(authors) !== JSON.stringify(record.authors.map((author) => author.family))) {
      problem(`citations/${record.citationKey}.bib`, 'author order differs from the record');
    }
  }
}

// --- Publications render identically everywhere -------------------------------------------------------------------------
const stripTags = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const publicationPage = pages.find((page) => page.route === `${'/'}publications/`);
for (const record of publicPublications) {
  const canonicalHtml = publicationPage?.html.match(new RegExp(`<li[^>]*id="${record.id}"[\\s\\S]*?</li>`))?.[0];
  if (!canonicalHtml) {
    problem('publications/', `entry #${record.id} not found`);
    continue;
  }
  const authorsOf = (html) => stripTags(/<p class="authors[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '');
  const expectedAuthors = authorsOf(canonicalHtml);
  if (!/<strong[^>]*>[^<]+<\/strong>/.test(canonicalHtml)) problem('publications/', `#${record.id} does not mark the author's name with <strong>`);
  if (!canonicalHtml.includes(`href="https://doi.org/${record.doi}"`)) problem('publications/', `#${record.id} is missing its DOI link`);
  for (const page of pages) {
    const other = page.html.match(new RegExp(`<li[^>]*id="${record.id}"[\\s\\S]*?</li>`))?.[0];
    if (other && authorsOf(other) !== expectedAuthors) problem(page.path, `authors of #${record.id} differ from the bibliography`);
    if (other && !other.includes(String(record.year))) problem(page.path, `year of #${record.id} is missing`);
  }
}
// The CV page is a PDF landing page (open/download), so only Home repeats the publication list.
for (const route of ['/']) {
  const page = pages.find((candidate) => candidate.route === route);
  for (const record of publicPublications) {
    if (!page?.html.includes(`id="${record.id}"`)) problem(route, `publication #${record.id} is missing`);
  }
}

// --- Report ---------------------------------------------------------------------------------------------------------------------
if (problems.length > 0) {
  console.error(`Output check FAILED for ${relative(ROOT, DIST)} (${site.environment}, base ${site.base}): ${problems.length} problem(s)\n`);
  for (const message of problems) console.error(`  ✖ ${message}`);
  process.exit(1);
}
console.log(
  `Output check passed for ${relative(ROOT, DIST)} (${site.environment}, ${site.origin}${site.base}): ${pages.length} pages, ${files.length} files, ${sitemapLocs.length} sitemap URLs.`,
);

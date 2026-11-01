// Minimal static server for a built site, behaving like GitHub Pages: directory
// index files, a redirect to the trailing slash, and 404.html with a real 404.
// Unlike `astro preview` it can run alongside another preview and can serve a
// sub-path deployment, which the end-to-end tests use.
//
//   node scripts/serve-dist.mjs [--dir dist] [--port 4323] [--base /]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { ROOT } from './lib/content-files.mjs';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};

const dir = join(ROOT, arg('dir', 'dist'));
const port = Number(arg('port', '4323'));
const base = `/${arg('base', '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.bib': 'application/x-bibtex; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
};

function send(response, status, file) {
  response.writeHead(status, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': statSync(file).size,
  });
  createReadStream(file).pipe(response);
}

const server = createServer((request, response) => {
  let url;
  let pathname;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // A target such as "//" or a malformed escape such as "%" must not take the server down.
    return response.writeHead(400).end('Bad request');
  }

  if (!pathname.startsWith(base)) {
    // Outside the base path: a real 404, as on a project site.
    const notFound = join(dir, '404.html');
    return existsSync(notFound) ? send(response, 404, notFound) : response.writeHead(404).end('Not found');
  }

  const relative = normalize(pathname.slice(base.length)).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
  let file = join(dir, relative);
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!pathname.endsWith('/')) {
      // Built from the resolved path, never the request, so it cannot point off-site or inject a header.
      response.writeHead(301, { Location: `${base}${encodeURI(relative)}/${url.search}` });
      return response.end();
    }
    file = join(file, 'index.html');
  }
  if (existsSync(file) && statSync(file).isFile()) return send(response, 200, file);

  const notFound = join(dir, '404.html');
  return existsSync(notFound) ? send(response, 404, notFound) : response.writeHead(404).end('Not found');
});

server.listen(port, 'localhost', () => {
  console.log(`Serving ${dir} at http://localhost:${port}${base}`);
});

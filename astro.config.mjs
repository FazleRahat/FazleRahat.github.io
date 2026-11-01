import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { resolveSiteConfig } from './site.config.mjs';
import { loadSitemapDates } from './scripts/lib/content-files.mjs';

const site = resolveSiteConfig(process.env, { dev: process.argv.includes('dev') });
const dates = loadSitemapDates();

const routePath = (url) => new URL(url).pathname.slice(site.base.length - 1);

export default defineConfig({
  site: site.origin,
  base: site.base,
  trailingSlash: 'always',
  compressHTML: true,
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // GitHub Pages cannot set response headers, so the policy ships as a <meta> tag on each page,
  // with hashes of its inline scripts and styles. A <meta> policy cannot set frame-ancestors.
  security: {
    csp: {
      // connect-src is only for audit tools: Lighthouse reads robots.txt with a fetch from inside the page.
      directives: ["default-src 'none'", "img-src 'self'", "font-src 'self'", "media-src 'self'", "connect-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'"],
    },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('/404/'),
      serialize(item) {
        const path = routePath(item.url);
        return { ...item, lastmod: dates.forPath(path) };
      },
    }),
  ],
  vite: {
    define: {
      'import.meta.env.PUBLIC_SITE_ENV': JSON.stringify(site.environment),
    },
  },
});

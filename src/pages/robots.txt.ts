import type { APIRoute } from 'astro';
import { absolute, isIndexable } from '../lib/site';

// Only the production build advertises a sitemap. Preview builds disallow crawling,
// but robots.txt is a courtesy, not access control; previews also carry noindex.
export const GET: APIRoute = () => {
  const body = isIndexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${absolute('/sitemap-index.xml')}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

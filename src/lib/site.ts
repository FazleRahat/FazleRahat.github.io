// Runtime site settings, derived from the values astro.config.mjs resolved.
import { createUrls } from './urls.ts';

export type SiteEnvironment = 'development' | 'preview' | 'production';

export const siteEnvironment = (import.meta.env.PUBLIC_SITE_ENV ?? 'preview') as SiteEnvironment;

const urls = createUrls({
  base: import.meta.env.BASE_URL,
  origin: import.meta.env.SITE ?? 'http://localhost:4321',
});

export const { withBase, absolute } = urls;
export const siteBase = urls.base;

/** Only production is indexable; everything else carries noindex. */
export const isIndexable = siteEnvironment === 'production';

// Every internal link and public asset goes through these helpers so the site
// works at the domain root ("/") and under a repository sub-path ("/name/").

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function normalizeBase(base: string): string {
  const trimmed = base.trim();
  if (trimmed === '' || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

export type Urls = {
  base: string;
  origin: string;
  /** Base-aware path for an internal route or public file. */
  withBase: (path: string) => string;
  /** Absolute canonical URL for an internal route or public file. */
  absolute: (path: string) => string;
};

export function createUrls(options: { base: string; origin: string }): Urls {
  const base = normalizeBase(options.base);
  const origin = options.origin.replace(/\/+$/, '');

  const withBase = (path: string): string => {
    // Schemes (https:, mailto:), protocol-relative URLs and bare fragments pass through.
    if (EXTERNAL.test(path) || path.startsWith('#')) return path;
    return `${base}${path.replace(/^\/+/, '')}`;
  };

  const absolute = (path: string): string => {
    if (EXTERNAL.test(path)) return path;
    return `${origin}${withBase(path)}`;
  };

  return { base, origin, withBase, absolute };
}

/** Normalizes a pathname to the route form used for nav matching ("/research/"). */
export function routeOf(pathname: string, base: string): string {
  const normalizedBase = normalizeBase(base);
  let path = pathname.startsWith(normalizedBase) ? pathname.slice(normalizedBase.length - 1) : pathname;
  if (!path.startsWith('/')) path = `/${path}`;
  return path.endsWith('/') || path.includes('.') ? path : `${path}/`;
}

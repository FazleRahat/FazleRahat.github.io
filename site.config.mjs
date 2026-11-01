// Build-time site configuration shared by astro.config.mjs and the Node scripts.
// Plain ESM on purpose: it must load before Astro (and without TypeScript).
//
//   SITE_ENV     development | preview | production   (default: preview)
//   SITE_ORIGIN  https://host   (required when SITE_ENV=production)
//   SITE_BASE    "/" or "/repository/"                 (default: "/")

export const SITE_ENVIRONMENTS = ['development', 'preview', 'production'];
export const DEV_ORIGIN = 'http://localhost:4321';

// Hosts that must never appear in a production build.
const PLACEHOLDER_HOSTS = /(^|\.)(localhost|example\.(com|org|net))$|^127\.|^0\.0\.0\.0$/i;

export function normalizeBase(raw) {
  const value = (raw ?? '/').trim();
  if (value === '' || value === '/') return '/';
  const segments = value.slice(value.startsWith('/') ? 1 : 0, value.endsWith('/') ? -1 : undefined).split('/');
  if (!segments.every((segment) => /^[A-Za-z0-9._~-]+$/.test(segment) && segment !== '.' && segment !== '..')) {
    throw new Error(`SITE_BASE "${raw}" is not a valid path such as "/" or "/repository/".`);
  }
  return `/${segments.join('/')}/`;
}

export function resolveSiteConfig(env = process.env, { dev = false } = {}) {
  const environment = env.SITE_ENV ?? (dev ? 'development' : 'preview');
  if (!SITE_ENVIRONMENTS.includes(environment)) {
    throw new Error(`SITE_ENV must be one of ${SITE_ENVIRONMENTS.join(', ')} (received "${environment}").`);
  }

  const base = normalizeBase(env.SITE_BASE);
  let origin = env.SITE_ORIGIN?.trim().replace(/\/+$/, '');

  if (environment === 'production') {
    if (!origin) {
      throw new Error(
        'Production builds need a real HTTPS origin. Set SITE_ORIGIN (for example https://your-domain) before running the release build.',
      );
    }
    const url = new URL(origin);
    if (url.protocol !== 'https:') throw new Error(`SITE_ORIGIN must use https (received "${origin}").`);
    if (PLACEHOLDER_HOSTS.test(url.hostname)) {
      throw new Error(`SITE_ORIGIN "${origin}" is a placeholder or local host and cannot be used for production.`);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error('SITE_ORIGIN must be an origin only; put any sub-path in SITE_BASE.');
    }
    origin = url.origin;
  } else {
    origin ||= DEV_ORIGIN;
  }

  return { environment, origin, base };
}

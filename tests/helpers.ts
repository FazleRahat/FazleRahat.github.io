import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relative: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8'));

export const profile = read('src/data/profile.json');
export const site: { showPhdAvailability: boolean; availabilityText?: string; availabilityExpiresOn?: string } = read('src/data/site.json');
export const events: { id: string; title: string; start: string; draft: boolean; type: string; role: string; event: string }[] = read('src/data/events.json');
export const publications: { id: string; title: string; doi: string; publisherUrl?: string; citationKey: string; year: number; contribution: string }[] = read('src/data/publications.json');
export const experience: { title: string; kind: string; end: string | null }[] = read('src/data/experience.json');

/** The events page, its navigation link and its sitemap entry exist only while at least one event is public. */
export const hasPublicEvents = events.some((item) => !item.draft);
export const PRIMARY_ROUTES = ['/', '/research/', '/publications/', ...(hasPublicEvents ? ['/events/'] : []), '/teaching/', '/about/', '/cv/'];
export const NAV_LABELS = ['Research', 'Publications', ...(hasPublicEvents ? ['Talks & Events'] : []), 'Teaching', 'About', 'CV'];
export const ALL_PAGES = PRIMARY_ROUTES;
/** Per-project pages that used to exist and must now return 404. */
export const REMOVED_CASE_STUDY_ROUTES = [
  'hydroponic-decision-support',
  'medical-language-models',
  'iomt-security-review',
  'digimindready',
  'goldenvaxshield',
].map((slug) => `/research/${slug}/`);

/** Relative to baseURL so the same tests work at the root and under a sub-path. */
export const rel = (path: string): string => path.replace(/^\//, '');

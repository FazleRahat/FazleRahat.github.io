// Reads the same content files Astro reads, without Astro. Used by the build
// config (sitemap dates) and by validate-content / check-output.
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const readJson = (relative) => JSON.parse(readFileSync(join(ROOT, relative), 'utf8'));

export function parseFrontmatter(source, file = '(unknown)') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: missing YAML frontmatter`);
  return { data: parseYaml(match[1]) ?? {}, body: match[2] };
}

export function loadResearchFiles() {
  const dir = join(ROOT, 'src/content/research');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const file = `src/content/research/${name}`;
      const { data, body } = parseFrontmatter(readFileSync(join(ROOT, file), 'utf8'), file);
      return { id: basename(name, '.md'), file, data, body };
    });
}

export function loadRawContent() {
  return {
    profile: readJson('src/data/profile.json'),
    site: readJson('src/data/site.json'),
    publications: readJson('src/data/publications.json'),
    education: readJson('src/data/education.json'),
    experience: readJson('src/data/experience.json'),
    teaching: readJson('src/data/teaching.json'),
    skills: readJson('src/data/skills.json'),
    events: readJson('src/data/events.json'),
    research: loadResearchFiles(),
  };
}

const latest = (dates) => dates.filter(Boolean).sort().at(-1);
const toIso = (date) => (date ? new Date(`${date}T00:00:00Z`).toISOString() : undefined);

/** Author-maintained review dates per public route, for the sitemap `lastmod`. */
export function loadSitemapDates() {
  const content = loadRawContent();
  const research = content.research.filter((entry) => !entry.data.draft);
  const publications = content.publications.filter((record) => !record.draft);

  const site = content.profile.contentReviewedOn;
  const forPath = (path) => {
    switch (path) {
      case '/research/':
        return toIso(latest(research.map((entry) => entry.data.reviewedOn)));
      case '/publications/':
        return toIso(latest(publications.map((record) => record.reviewedOn)));
      case '/events/':
        return toIso(latest([...content.events.filter((record) => !record.draft).map((record) => record.reviewedOn), site]));
      case '/teaching/':
        return toIso(latest(content.teaching.map((record) => record.reviewedOn)));
      case '/cv/':
        return toIso(latest([content.profile.cv.reviewedOn, site]));
      default:
        return toIso(site);
    }
  };
  return { forPath };
}

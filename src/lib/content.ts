// The one place pages read content from. Every renderer (pages, bibliography
// exports, sitemap-adjacent endpoints, structured data) uses these selectors, so
// a draft record is absent from all outputs at once.
import { getCollection, type CollectionEntry } from 'astro:content';
import profileJson from '../data/profile.json';
import siteJson from '../data/site.json';
import skillsJson from '../data/skills.json';
import { dateKey, termKey } from './dates.ts';
import { comparePublications } from './citations.ts';
import { profileSchema, siteSchema, skillGroupSchema, type Publication, type SiteEvent } from './schemas.ts';

export const profile = profileSchema.parse(profileJson);
export const site = siteSchema.parse(siteJson);
export const skills = skillGroupSchema.array().parse(skillsJson);

export type ResearchEntry = CollectionEntry<'research'>;

export async function getPublications(): Promise<Publication[]> {
  const entries = await getCollection('publications');
  return entries
    .map((entry) => entry.data)
    .filter((publication) => !publication.draft)
    .sort(comparePublications);
}

export async function getResearch(): Promise<ResearchEntry[]> {
  const entries = await getCollection('research', (entry) => !entry.data.draft);
  return entries.sort((a, b) => a.data.order - b.data.order);
}

export async function getEducation() {
  const entries = await getCollection('education');
  return entries.map((entry) => entry.data).sort((a, b) => dateKey(b.start) - dateKey(a.start));
}

/** Reverse-chronological by start date; overlapping appointments are shown as they are. */
export async function getExperience(kind?: 'research' | 'collaboration' | 'teaching') {
  const entries = await getCollection('experience');
  return entries
    .map((entry) => entry.data)
    .filter((record) => (kind ? record.kind === kind : true))
    .sort((a, b) => dateKey(b.start) - dateKey(a.start));
}

export async function getResearchExperience() {
  return (await getExperience()).filter((record) => record.kind !== 'teaching');
}

export async function getTeachingAppointment() {
  const [appointment] = await getExperience('teaching');
  return appointment;
}

/** Courses newest term first; `sortOrder` breaks ties within a term. */
export async function getTeachingCourses() {
  const entries = await getCollection('teaching');
  return entries
    .map((entry) => entry.data)
    .sort((a, b) => termKey(b.term) - termKey(a.term) || a.sortOrder - b.sortOrder);
}

/** Public publications attached to a research record, in canonical order. */
export async function publicationsForResearch(entry: ResearchEntry): Promise<Publication[]> {
  const publications = await getPublications();
  const wanted = new Set(entry.data.publicationIds);
  return publications.filter((publication) => wanted.has(publication.id));
}

/** Optional availability statement: off by default, and silent once it has expired. */
export function currentAvailability(today: string): string | undefined {
  if (!site.showPhdAvailability || !site.availabilityText) return undefined;
  if (site.availabilityExpiresOn && site.availabilityExpiresOn < today) return undefined;
  return site.availabilityText;
}

export const profileLinks = () => {
  const { scholar, linkedin, github, orcid } = profile.links;
  return [
    scholar && { label: 'Google Scholar', href: scholar },
    linkedin && { label: 'LinkedIn', href: linkedin },
    github && { label: 'GitHub', href: github },
    orcid && { label: 'ORCID', href: orcid },
  ].filter((link): link is { label: string; href: string } => Boolean(link));
};

export const CONTEXT_LABELS = {
  'proposed-ms-thesis': 'Proposed MS thesis',
  'undergraduate-thesis': 'Undergraduate thesis',
  collaboration: 'Research collaboration',
} as const;

export const STATUS_LABELS = { ongoing: 'Ongoing', completed: 'Completed' } as const;

/** Public talks and events, newest first. `sortOrder` breaks ties on the same date. */
export async function getEvents(): Promise<SiteEvent[]> {
  const entries = await getCollection('events');
  return entries
    .map((entry) => entry.data)
    .filter((item) => !item.draft)
    .sort(
      (a, b) =>
        dateKey(b.start) - dateKey(a.start) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title),
    );
}

export const EVENT_TYPE_LABELS: Record<SiteEvent['type'], string> = {
  'conference-presentation': 'Conference presentation',
  'invited-talk': 'Invited talk',
  poster: 'Poster',
  workshop: 'Workshop',
  panel: 'Panel',
  seminar: 'Seminar',
  other: 'Event',
};

// Semantic integrity checks that a schema alone cannot express: uniqueness,
// cross-references, public/draft consistency, statuses and local files.
// Pure by design: file access is injected so the same function is unit-testable
// and runs inside scripts/validate-content.mjs.
import type { ZodType } from 'astro/zod';
import { areaSlug } from './areas.ts';
import { dateKey, isFullDate } from './dates.ts';
import {
  educationSchema,
  eventSchema,
  experienceSchema,
  profileSchema,
  publicationSchema,
  researchSchema,
  skillGroupSchema,
  siteSchema,
  teachingSchema,
  type Education,
  type Experience,
  type SiteEvent,
  type Profile,
  type Publication,
  type Research,
  type SiteData,
  type SkillGroup,
  type TeachingCourse,
} from './schemas.ts';

export type RawContent = {
  profile: unknown;
  site: unknown;
  publications: unknown[];
  education: unknown[];
  experience: unknown[];
  teaching: unknown[];
  skills: unknown[];
  events: unknown[];
  research: { id: string; file: string; data: unknown; body: string }[];
};

export type FileProbe = {
  /** Does a file exist at this project-relative path? */
  exists(path: string): boolean;
  size(path: string): number;
  sha256(path: string): string;
};

export type Issue = { level: 'error' | 'warning'; where: string; message: string };

export type ValidationOptions = {
  files?: FileProbe;
  /** YYYY-MM-DD used for "not in the future" and expiry rules. */
  today: string;
};

const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|lorem ipsum)\b|\bplaceholder\b/i;
const FORBIDDEN_HOST = /(?:^|\/\/|\.)(?:localhost|example\.(?:com|org|net))(?::\d+)?(?:\/|$)/i;

function parseAll<T>(schema: ZodType<T>, rows: unknown[], where: string, issues: Issue[]): T[] {
  const parsed: T[] = [];
  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    const label = `${where}[${index}]${typeof row === 'object' && row && 'id' in row ? ` (${String((row as { id: unknown }).id)})` : ''}`;
    if (result.success) parsed.push(result.data);
    else {
      for (const issue of result.error.issues) {
        issues.push({ level: 'error', where: `${label}.${issue.path.join('.')}`, message: issue.message });
      }
    }
  });
  return parsed;
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

const wordCount = (text: string): number => text.trim().split(/\s+/).length;

export function validateContent(raw: RawContent, options: ValidationOptions): { issues: Issue[] } {
  const issues: Issue[] = [];
  const error = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message });

  // --- Schemas ----------------------------------------------------------------
  const profileResult = profileSchema.safeParse(raw.profile);
  let profile: Profile | undefined;
  if (profileResult.success) profile = profileResult.data;
  else for (const i of profileResult.error.issues) error(`profile.json ${i.path.join('.')}`, i.message);

  const siteResult = siteSchema.safeParse(raw.site);
  let site: SiteData | undefined;
  if (siteResult.success) site = siteResult.data;
  else for (const i of siteResult.error.issues) error(`site.json ${i.path.join('.')}`, i.message);

  const publications = parseAll<Publication>(publicationSchema, raw.publications, 'publications.json', issues);
  const education = parseAll<Education>(educationSchema, raw.education, 'education.json', issues);
  const experience = parseAll<Experience>(experienceSchema, raw.experience, 'experience.json', issues);
  const teaching = parseAll<TeachingCourse>(teachingSchema, raw.teaching, 'teaching.json', issues);
  const skills = parseAll<SkillGroup>(skillGroupSchema, raw.skills, 'skills.json', issues);
  const events = parseAll<SiteEvent>(eventSchema, raw.events, 'events.json', issues);

  const research: { id: string; file: string; data: Research; body: string }[] = [];
  for (const entry of raw.research) {
    const result = researchSchema.safeParse(entry.data);
    if (result.success) research.push({ ...entry, data: result.data });
    else for (const i of result.error.issues) error(`${entry.file} ${i.path.join('.')}`, i.message);
  }

  // --- Uniqueness ---------------------------------------------------------------
  for (const [name, ids] of [
    ['publications.json id', publications.map((p) => p.id)],
    ['publications.json citationKey', publications.map((p) => p.citationKey)],
    ['publications.json doi', publications.flatMap((p) => (p.doi ? [p.doi.toLowerCase()] : []))],
    ['education.json id', education.map((e) => e.id)],
    ['experience.json id', experience.map((e) => e.id)],
    ['teaching.json id', teaching.map((t) => t.id)],
    ['skills.json id', skills.map((g) => g.id)],
    ['events.json id', events.map((e) => e.id)],
    ['research slug', research.map((r) => r.id)],
  ] as const) {
    for (const duplicate of findDuplicates([...ids])) error(name, `"${duplicate}" is used more than once`);
  }

  // --- Public vs draft ----------------------------------------------------------
  const publicPublications = publications.filter((p) => !p.draft);
  const publicResearch = research.filter((r) => !r.data.draft);
  const publicationById = new Map(publications.map((p) => [p.id, p]));
  const researchById = new Map(research.map((r) => [r.id, r]));
  const experienceById = new Map(experience.map((e) => [e.id, e]));

  const checkResearchRef = (where: string, id: string | undefined) => {
    if (!id) return;
    const target = researchById.get(id);
    if (!target) error(where, `researchId "${id}" does not exist`);
    else if (target.data.draft) error(where, `researchId "${id}" is a draft and cannot be linked from public content`);
  };

  // --- Publications -------------------------------------------------------------
  for (const pub of publications) {
    const where = `publications.json (${pub.id})`;
    const selfAuthors = pub.authors.filter((a) => a.personId === 'rahat');
    if (selfAuthors.length !== 1) error(where, `expected exactly one author with personId "rahat", found ${selfAuthors.length}`);
    if (pub.title.trim().endsWith('.')) error(where, 'store the title without a trailing period; renderers add punctuation');
    if (/[{}]/.test(pub.title)) error(where, 'do not put braces in titles; case protection is added by the serializer');
    if (pub.status === 'published' && !pub.doi && !pub.publisherUrl) error(where, 'a published record needs a DOI or publisherUrl');
    if (pub.status === 'published' && pub.draft) warn(where, 'record is published but marked draft; it will not appear anywhere');
    if (pub.pdf && !pub.pdf.publicUseVerified) error(where, 'a public PDF requires publicUseVerified: true; otherwise link the DOI');
    if (pub.year > Number(options.today.slice(0, 4)) + 1) warn(where, `year ${pub.year} is unusually far in the future`);
    if (!pub.draft) {
      checkResearchRef(where, pub.researchId);
      if (pub.researchId && researchById.get(pub.researchId) && !researchById.get(pub.researchId)!.data.publicationIds.includes(pub.id)) {
        error(where, `research "${pub.researchId}" does not list this publication in publicationIds`);
      }
    }
    for (const field of [pub.venue, pub.contribution, pub.title]) {
      if (PLACEHOLDER.test(field)) error(where, `placeholder text found: "${field.slice(0, 40)}"`);
    }
  }

  // --- Research -----------------------------------------------------------------
  for (const entry of research) {
    const where = entry.file;
    const data = entry.data;
    for (const pubId of data.publicationIds) {
      const pub = publicationById.get(pubId);
      if (!pub) error(where, `publicationIds references unknown publication "${pubId}"`);
      else {
        if (pub.draft && !data.draft) error(where, `publication "${pubId}" is a draft and cannot be linked from public content`);
        if (pub.researchId !== entry.id) error(where, `publication "${pubId}" has researchId "${pub.researchId ?? '(none)'}", expected "${entry.id}"`);
      }
    }
    if (data.context === 'proposed-ms-thesis' && data.status !== 'ongoing') {
      error(where, 'a proposed MS thesis must remain status: ongoing until the thesis is actually completed');
    }
    if (data.start && data.end && dateKey(data.start) > dateKey(data.end)) error(where, 'start is after end');
    const areas = data.areas ?? [];
    for (const area of areas) if (!areaSlug(area)) error(where, `area "${area}" has no letters or digits to build a link from`);
    if (new Set(areas.map(areaSlug)).size !== areas.length) error(where, 'areas lists the same area twice');
    if (!data.periodLabel && !data.start) warn(where, 'no periodLabel or start; the metadata block will omit the period');
    const blurbWords = wordCount(data.blurb);
    if (blurbWords < 30 || blurbWords > 100) warn(where, `blurb is ${blurbWords} words; the home/overview target is roughly 40–80`);
    if (PLACEHOLDER.test(entry.body) || PLACEHOLDER.test(data.summary ?? '') || PLACEHOLDER.test(data.blurb)) {
      error(where, 'placeholder text found');
    }
    if (data.hero && options.files && !options.files.exists(`src/assets/${data.hero.src}`)) {
      error(where, `hero image "${data.hero.src}" not found under src/assets`);
    }
  }

  // --- Education, experience, teaching --------------------------------------------
  for (const record of education) {
    const where = `education.json (${record.id})`;
    checkResearchRef(where, record.researchId);
    if (record.end && dateKey(record.start) > dateKey(record.end)) error(where, 'start is after end');
    if (record.expectedEnd) {
      if (dateKey(record.start) > dateKey(record.expectedEnd)) error(where, 'start is after expectedEnd');
      if (dateKey(record.expectedEnd) < dateKey(options.today.slice(0, 7))) {
        warn(where, 'expectedEnd has passed; confirm whether the degree is complete before changing it');
      }
    }
  }
  for (const record of experience) {
    const where = `experience.json (${record.id})`;
    if (record.end && dateKey(record.start) > dateKey(record.end)) error(where, 'start is after end');
    for (const highlight of record.highlights) checkResearchRef(where, highlight.researchId);
  }
  for (const course of teaching) {
    const where = `teaching.json (${course.id})`;
    const appointment = experienceById.get(course.appointmentId);
    if (!appointment) error(where, `appointmentId "${course.appointmentId}" does not exist in experience.json`);
    else if (appointment.kind !== 'teaching') error(where, `appointment "${course.appointmentId}" is not a teaching appointment`);
  }
  // --- Talks and events -----------------------------------------------------------
  for (const item of events) {
    const where = `events.json (${item.id})`;
    if (item.end && dateKey(item.start) > dateKey(item.end)) error(where, 'start is after end');
    if (!item.draft) {
      if (item.publicationId) {
        const pub = publicationById.get(item.publicationId);
        if (!pub) error(where, `publicationId "${item.publicationId}" does not exist`);
        else if (pub.draft) error(where, `publication "${item.publicationId}" is a draft and cannot be linked from public content`);
      }
      checkResearchRef(where, item.researchId);
    }
    for (const field of [item.title, item.event, item.role, item.summary ?? '']) {
      if (PLACEHOLDER.test(field)) error(where, `placeholder text found: "${field.slice(0, 40)}"`);
    }
    for (const [name, link] of Object.entries(item.links)) {
      if (!link || !options.files) continue;
      if (link.startsWith('/') && !options.files.exists(`public${link}`)) error(where, `links.${name} "${link}" not found under public/`);
      if (link.startsWith('/') && options.files.exists(`public${link}`) && options.files.size(`public${link}`) === 0) error(where, `links.${name} "${link}" is empty`);
    }
    if (item.type === 'conference-presentation' && !item.publicationId && !item.summary) {
      warn(where, 'a conference presentation usually names the paper (publicationId) or has a short summary');
    }
  }

  for (const [name, bucket] of [
    ['education.json', education.map((r) => r.reviewedOn)],
    ['experience.json', experience.map((r) => r.reviewedOn)],
    ['teaching.json', teaching.map((r) => r.reviewedOn)],
    ['events.json', events.map((r) => r.reviewedOn)],
    ['publications.json', publications.map((r) => r.reviewedOn)],
    ['research', research.map((r) => r.data.reviewedOn)],
  ] as const) {
    for (const date of bucket) if (date > options.today) error(name, `reviewedOn ${date} is in the future`);
  }

  // --- Profile, site, local files -------------------------------------------------
  if (profile) {
    if (profile.contentReviewedOn > options.today) error('profile.json', 'contentReviewedOn is in the future');
    const portrait = profile.portrait;
    if (portrait && options.files && !options.files.exists(`src/assets/${portrait.src}`)) {
      error('profile.json', `portrait "${portrait.src}" not found under src/assets; remove the portrait field to use the text-only identity`);
    }
    for (const [name, url] of Object.entries(profile.links)) {
      if (url && FORBIDDEN_HOST.test(url)) error('profile.json', `links.${name} points to a placeholder or local host`);
    }
    if (options.files) {
      const cvPath = `public${profile.cv.path}`;
      if (!options.files.exists(cvPath)) error('profile.json', `cv.path "${profile.cv.path}" not found under public/`);
      else {
        const size = options.files.size(cvPath);
        if (size === 0) error('profile.json', 'the CV PDF is empty');
        else {
          if (size !== profile.cv.bytes) error('profile.json', `cv.bytes is ${profile.cv.bytes} but the file is ${size} bytes; run pnpm cv:manifest after replacing the PDF`);
          if (options.files.sha256(cvPath) !== profile.cv.sha256) error('profile.json', 'cv.sha256 does not match the file; run pnpm cv:manifest after replacing the PDF');
        }
      }
      for (const pub of publications) {
        if (pub.pdf) {
          const path = `public${pub.pdf.path}`;
          if (!options.files.exists(path) || options.files.size(path) === 0) error(`publications.json (${pub.id})`, `pdf "${pub.pdf.path}" is missing or empty`);
        }
      }
    }
  }
  if (site) {
    if (site.showPhdAvailability && !site.availabilityText) error('site.json', 'showPhdAvailability is true but availabilityText is empty');
    if (site.showPhdAvailability && !site.availabilityExpiresOn) warn('site.json', 'availability text is shown without availabilityExpiresOn; it would never expire');
    if (site.availabilityExpiresOn && isFullDate(site.availabilityExpiresOn) && site.availabilityExpiresOn < options.today) {
      warn('site.json', `availability text expired on ${site.availabilityExpiresOn}; it is omitted from the site`);
    }
    for (const duplicate of findDuplicates(site.nav.map((item) => item.href))) error('site.json', `nav href "${duplicate}" is duplicated`);
  }

  // Public publications must be reachable somewhere.
  if (publicPublications.length === 0) warn('publications.json', 'there are no public publications');
  if (publicResearch.length === 0) warn('research', 'there are no public research records');

  return { issues };
}

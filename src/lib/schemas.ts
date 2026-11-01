// Single source of truth for the shape of every content record.
// Imported by src/content.config.ts (Astro build) and by scripts/validate-content.mjs
// (plain Node), so the build and the standalone check can never disagree.
import { z } from 'astro/zod';
import { isFullDate, isPartialDate } from './dates.ts';

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a stable lowercase-kebab-case id');
const text = z.string().trim().min(1);
const partialDate = z.string().refine(isPartialDate, 'Use YYYY, YYYY-MM or YYYY-MM-DD (a real date)');
const reviewDate = z.string().refine(isFullDate, 'Use YYYY-MM-DD (a real date)');

/** https only; contact links use the dedicated email field. No "#" or empty placeholders. */
export const httpsUrl = z.string().refine((value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'Must be an absolute https URL');

/** Path to a file under /public, such as /files/cv.pdf. */
const publicPath = z.string().regex(/^\/[A-Za-z0-9._~\-/]+$/, 'Must be an absolute public path such as /files/name.pdf');
/** Path relative to src/assets, such as portrait/portrait.jpg. */
const assetPath = z.string().regex(/^[A-Za-z0-9._~\-/]+\.(?:jpe?g|png|webp|avif|svg)$/i, 'Must be a path under src/assets');

const image = z.strictObject({
  src: assetPath,
  alt: text,
  credit: text.optional(),
});

// --- Profile and site ------------------------------------------------------

export const profileSchema = z.strictObject({
  id: z.literal('rahat'),
  displayName: text,
  nativeName: text.optional(),
  preferredName: text.optional(),
  pronunciation: text.optional(),
  shortName: text.optional(),
  headline: text,
  bioShort: z.array(text).min(1),
  bioLong: z.array(text).min(1),
  institution: text,
  department: text,
  lab: text,
  location: text,
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be an email address'),
  schoolEmail: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be an email address').optional(),
  links: z.strictObject({
    scholar: httpsUrl.optional(),
    linkedin: httpsUrl.optional(),
    github: httpsUrl.optional(),
    orcid: httpsUrl.optional(),
  }),
  researchInterests: z.array(text).min(1),
  portrait: image.optional(),
  cv: z.strictObject({
    path: publicPath,
    reviewedOn: reviewDate,
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  contentReviewedOn: reviewDate,
});
export type Profile = z.infer<typeof profileSchema>;

export const siteSchema = z.strictObject({
  siteName: text,
  homeTitle: text,
  defaultDescription: text,
  showPhdAvailability: z.boolean(),
  availabilityText: text.optional(),
  availabilityExpiresOn: reviewDate.optional(),
  nav: z
    .array(
      z.strictObject({
        label: text,
        href: z.string().regex(/^\/[a-z-]*\/?$/),
        match: z.string(),
        /** Show this item only while the named content exists ("events": at least one public event). */
        requires: z.literal('events').optional(),
      }),
    )
    .min(1),
});
export type SiteData = z.infer<typeof siteSchema>;

// --- Education, experience, teaching ---------------------------------------

export const educationSchema = z
  .strictObject({
    id,
    degree: text,
    institution: text,
    location: text,
    start: partialDate,
    end: partialDate.optional(),
    expectedEnd: partialDate.optional(),
    thesis: z
      .strictObject({
        label: z.enum(['Thesis', 'Proposed thesis']),
        title: text,
      })
      .optional(),
    researchId: id.optional(),
    reviewedOn: reviewDate,
  })
  .refine((record) => !(record.end && record.expectedEnd), {
    message: 'Use either end (actual) or expectedEnd, not both',
    path: ['expectedEnd'],
  });
export type Education = z.infer<typeof educationSchema>;

export const experienceSchema = z.strictObject({
  id,
  kind: z.enum(['research', 'collaboration', 'teaching']),
  title: text,
  organization: text,
  location: text.optional(),
  start: partialDate,
  end: partialDate.nullable(),
  advisor: text.optional(),
  /** Who supervised the work, for appointments that are not advised (for example a collaboration). */
  supervisor: text.optional(),
  highlights: z.array(z.strictObject({ text, researchId: id.optional() })).default([]),
  reviewedOn: reviewDate,
}).refine((record) => record.kind !== 'teaching' || record.highlights.length > 0, {
  message: 'Teaching appointments need at least one responsibility',
  path: ['highlights'],
});
export type Experience = z.infer<typeof experienceSchema>;

export const teachingSchema = z.strictObject({
  id,
  title: text,
  term: z.strictObject({
    year: z.number().int().min(2000).max(2100),
    term: z.enum(['Winter', 'Spring', 'Summer', 'Fall']),
  }),
  role: text,
  appointmentId: id,
  sortOrder: z.number().int(),
  reviewedOn: reviewDate,
});
export type TeachingCourse = z.infer<typeof teachingSchema>;

export const skillGroupSchema = z.strictObject({
  id,
  label: text,
  items: z.array(text).min(1),
});
export type SkillGroup = z.infer<typeof skillGroupSchema>;

// --- Talks and events -----------------------------------------------------------

export const EVENT_TYPES = [
  'conference-presentation',
  'invited-talk',
  'poster',
  'workshop',
  'panel',
  'seminar',
  'other',
] as const;

/** An https URL, or a file you host under /public (for example /files/slides.pdf). */
const eventLink = z.union([httpsUrl, publicPath]);

export const eventSchema = z
  .strictObject({
    id,
    /** Title of the talk, poster or session. */
    title: text,
    type: z.enum(EVENT_TYPES),
    /** What you did there, in your words: "Presenter", "Invited speaker", "Panelist", "Organizer"… */
    role: text,
    /** The conference, seminar series or organization that hosted it. */
    event: text,
    start: partialDate,
    end: partialDate.optional(),
    /** City and country, or "Online". Omit when unknown. */
    location: text.optional(),
    summary: text.optional(),
    /** A paper presented at the event, linked through publications.json. */
    publicationId: id.optional(),
    researchId: id.optional(),
    links: z.strictObject({
      slides: eventLink.optional(),
      video: eventLink.optional(),
      poster: eventLink.optional(),
      abstract: eventLink.optional(),
      event: eventLink.optional(),
    }),
    /** Deliberate order among events that share a date. */
    sortOrder: z.number().int().optional(),
    draft: z.boolean(),
    reviewedOn: reviewDate,
  });
export type SiteEvent = z.infer<typeof eventSchema>;

// --- Publications -----------------------------------------------------------

export const publicationSchema = z.strictObject({
  id,
  title: text,
  authors: z
    .array(
      z.strictObject({
        given: text,
        family: text,
        display: text,
        personId: z.literal('rahat').optional(),
      }),
    )
    .min(1),
  year: z.number().int().min(1990).max(2100),
  sortOrder: z.number().int(),
  type: z.enum(['journal-article', 'conference-paper', 'preprint', 'manuscript']),
  status: z.enum(['published', 'accepted', 'preprint', 'under-review', 'in-preparation']),
  venue: text,
  venueShort: text,
  volume: text.optional(),
  issue: text.optional(),
  pages: text.optional(),
  articleNumber: text.optional(),
  doi: z
    .string()
    .regex(/^10\.\d{4,9}\/[A-Za-z0-9._()/:;-]+$/, 'Use the DOI identifier only, not the URL')
    .optional(),
  publisherUrl: httpsUrl.optional(),
  pdf: z
    .strictObject({ path: publicPath, version: text, publicUseVerified: z.boolean() })
    .optional(),
  contribution: text,
  researchId: id.optional(),
  citationKey: z.string().regex(/^[a-z][a-z0-9]+$/, 'Lowercase letters and digits only'),
  draft: z.boolean(),
  reviewedOn: reviewDate,
});
export type Publication = z.infer<typeof publicationSchema>;

// --- Research case studies (Markdown frontmatter) --------------------------------

export const RESEARCH_CONTEXTS = ['proposed-ms-thesis', 'undergraduate-thesis', 'collaboration'] as const;

export const researchSchema = z.strictObject({
  title: text,
  /** Short title for breadcrumbs and compact links. */
  shortTitle: text,
  /** A concise description for featured research; other rows use the blurb. */
  summary: text.optional(),
  /** 50–80 words shown on the home page and the research overview. */
  blurb: text,
  /** The guiding research question, when a single sentence states it faithfully. */
  question: text.optional(),
  status: z.enum(['ongoing', 'completed']),
  context: z.enum(RESEARCH_CONTEXTS),
  role: text,
  institution: text,
  /** Verified period wording; used instead of exact dates when only context is known. */
  periodLabel: text.optional(),
  start: partialDate.optional(),
  end: partialDate.nullable().optional(),
  advisor: text.optional(),
  themes: z.array(text).min(1),
  /**
   * Research areas this project belongs to, worded like the highlighted terms in the biography
   * ("large language models"). A highlighted term links to the research page with these projects marked.
   */
  areas: z.array(text).optional(),
  featuredOrder: z.number().int().positive().optional(),
  order: z.number().int(),
  publicationIds: z.array(id),
  links: z.strictObject({
    code: httpsUrl.optional(),
    demo: httpsUrl.optional(),
    thesis: httpsUrl.optional(),
    slides: httpsUrl.optional(),
  }),
  hero: image.extend({ caption: text }).optional(),
  draft: z.boolean(),
  reviewedOn: reviewDate,
}).refine((record) => record.featuredOrder === undefined || record.summary !== undefined, {
  message: 'Featured research needs a compact summary',
  path: ['summary'],
});
export type Research = z.infer<typeof researchSchema>;

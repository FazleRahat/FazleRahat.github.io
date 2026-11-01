import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import {
  educationSchema,
  eventSchema,
  experienceSchema,
  publicationSchema,
  researchSchema,
  teachingSchema,
} from './lib/schemas.ts';

const research = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/research' }),
  schema: researchSchema,
});

const publications = defineCollection({
  loader: file('src/data/publications.json'),
  schema: publicationSchema,
});

const education = defineCollection({
  loader: file('src/data/education.json'),
  schema: educationSchema,
});

const experience = defineCollection({
  loader: file('src/data/experience.json'),
  schema: experienceSchema,
});

const teaching = defineCollection({
  loader: file('src/data/teaching.json'),
  schema: teachingSchema,
});

const events = defineCollection({
  loader: file('src/data/events.json'),
  schema: eventSchema,
});

export const collections = { research, publications, education, experience, teaching, events };

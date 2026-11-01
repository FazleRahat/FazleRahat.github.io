// Research areas link the highlighted terms in the biography to the research page.
// A term and a project's `areas` entry match when they have the same slug, so
// "AI security and reliability" and "ai security and reliability" are one area.

/** URL- and attribute-safe key for a research area: "Large language models" → "large-language-models". */
export function areaSlug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugs of a project's areas, in order and without repeats. */
export function areaSlugs(areas: readonly string[] | undefined): string[] {
  return [...new Set((areas ?? []).map(areaSlug).filter(Boolean))];
}

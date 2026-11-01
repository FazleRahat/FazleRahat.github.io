// Deterministic citation output. The bibliography page, the per-record `.bib`
// files and `/publications.bib` are all produced from the same Publication
// records through the functions below.
import type { Publication } from './schemas.ts';

const BIBTEX_SPECIALS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/** Escapes characters BibTeX treats as markup. Dashes become `--`. */
export function escapeBibtex(text: string): string {
  return text
    .replace(/[\\&%$#_{}~^]/g, (char) => BIBTEX_SPECIALS[char] ?? char)
    .replace(/[–—]/g, '--');
}

/** Case-sensitive terms that BibTeX styles must not lowercase in a title. */
export const PROTECTED_TERMS = [
  'DigiMindReady',
  'GoldenVaxShield',
  'IoMT',
  'LLMs',
  'LLM',
  'VLMs',
  'VLM',
  'mHealth',
  'LoRA',
  'PEFT',
  'AI',
  'ML',
  'CHASE',
] as const;

const PROTECTED_PATTERN = new RegExp(`(?<![\\w{])(${PROTECTED_TERMS.join('|')})(?![\\w}])`, 'g');

/** Wraps protected terms in braces: `Optimizing {IoMT} Security ...`. Apply after escaping. */
export function protectTerms(text: string): string {
  return text.replace(PROTECTED_PATTERN, '{$1}');
}

export function bibtexEntryType(publication: Publication): 'article' | 'inproceedings' | 'misc' | 'unpublished' {
  switch (publication.type) {
    case 'journal-article':
      return 'article';
    case 'conference-paper':
      return 'inproceedings';
    case 'preprint':
      return 'misc';
    case 'manuscript':
      return 'unpublished';
  }
}

/** BibTeX author list from explicit given/family fields. Never parsed from display names. */
export function bibtexAuthors(publication: Publication): string {
  return publication.authors
    .map((author) => `${escapeBibtex(author.family)}, ${escapeBibtex(author.given)}`)
    .join(' and ');
}

export const doiUrl = (doi: string): string => `https://doi.org/${doi}`;

/** The value of the BibTeX field that carries the venue name. */
function venueField(publication: Publication): 'journal' | 'booktitle' | 'howpublished' | 'note' {
  switch (publication.type) {
    case 'journal-article':
      return 'journal';
    case 'conference-paper':
      return 'booktitle';
    case 'preprint':
      return 'howpublished';
    case 'manuscript':
      return 'note';
  }
}

export function bibtexFields(publication: Publication): [string, string][] {
  const fields: [string, string][] = [
    ['author', bibtexAuthors(publication)],
    ['title', protectTerms(escapeBibtex(publication.title))],
    [venueField(publication), escapeBibtex(publication.venue)],
    ['year', String(publication.year)],
  ];
  if (publication.volume) fields.push(['volume', escapeBibtex(publication.volume)]);
  if (publication.issue) fields.push(['number', escapeBibtex(publication.issue)]);
  if (publication.pages) fields.push(['pages', escapeBibtex(publication.pages)]);
  // BibTeX has no article-number field; biblatex's `eid` keeps it out of `pages`.
  if (publication.articleNumber) fields.push(['eid', escapeBibtex(publication.articleNumber)]);
  if (publication.doi) {
    fields.push(['doi', publication.doi]);
    fields.push(['url', doiUrl(publication.doi)]);
  }
  return fields;
}

/** One BibTeX entry, ending with a newline. */
export function toBibtex(publication: Publication): string {
  const width = Math.max(...bibtexFields(publication).map(([name]) => name.length));
  const lines = bibtexFields(publication).map(([name, value]) => `  ${name.padEnd(width)} = {${value}},`);
  return `@${bibtexEntryType(publication)}{${publication.citationKey},\n${lines.join('\n')}\n}\n`;
}

/** Every entry, in the order supplied, separated by one blank line. */
export function toBibtexFile(publications: readonly Publication[]): string {
  return publications.map(toBibtex).join('\n');
}

// --- Human-readable citation parts ---------------------------------------------

export const TYPE_LABELS: Record<Publication['type'], string> = {
  'journal-article': 'Journal article',
  'conference-paper': 'Conference paper',
  preprint: 'Preprint',
  manuscript: 'Manuscript',
};

export const STATUS_LABELS: Record<Publication['status'], string> = {
  published: 'Published',
  accepted: 'Accepted',
  preprint: 'Preprint',
  'under-review': 'Under review',
  'in-preparation': 'In preparation',
};

/** "191(9–10), e2039–e2048" or "41, article 100665" or "371–376". */
export function volumeAndPages(publication: Publication): string {
  const parts: string[] = [];
  if (publication.volume) {
    parts.push(publication.issue ? `${publication.volume}(${publication.issue})` : publication.volume);
  }
  if (publication.articleNumber) parts.push(`article ${publication.articleNumber}`);
  if (publication.pages) parts.push(publication.pages);
  return parts.join(', ');
}

/** Canonical ordering: newest year first, then the explicit sortOrder. */
export function comparePublications(a: Publication, b: Publication): number {
  return b.year - a.year || a.sortOrder - b.sortOrder;
}

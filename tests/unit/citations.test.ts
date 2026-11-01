import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from '@retorquere/bibtex-parser';
import {
  comparePublications,
  escapeBibtex,
  protectTerms,
  toBibtex,
  toBibtexFile,
  volumeAndPages,
} from '../../src/lib/citations.ts';
import { publicationSchema, type Publication } from '../../src/lib/schemas.ts';
import { loadRawContent } from '../../scripts/lib/content-files.mjs';

const publications: Publication[] = loadRawContent().publications.map((record: unknown) => publicationSchema.parse(record));
const byId = (id: string): Publication => {
  const found = publications.find((publication) => publication.id === id);
  assert.ok(found, id);
  return found;
};
const entryOf = (bibtex: string) => {
  const result = parse(bibtex);
  assert.deepEqual(result.errors, []);
  const [entry] = result.entries;
  assert.ok(entry);
  return entry;
};
const authorsOf = (bibtex: string): string[] =>
  (entryOf(bibtex).fields.author as { lastName: string; firstName: string }[]).map((a) => `${a.firstName} ${a.lastName}`);

describe('BibTeX serialization', () => {
  it('maps the conference paper to @inproceedings with the CV author order', () => {
    const entry = entryOf(toBibtex(byId('iomt-security-2025')));
    assert.equal(entry.type, 'inproceedings');
    assert.equal(entry.key, 'rahat2025iomt');
    assert.equal(entry.fields.year, '2025');
    assert.equal(entry.fields.doi, '10.1145/3721201.3724412');
    assert.equal(entry.fields.url, 'https://doi.org/10.1145/3721201.3724412');
    assert.equal(entry.fields.pages, '371–376');
    assert.deepEqual(authorsOf(toBibtex(byId('iomt-security-2025'))), ['M. F. R. Rahat', 'M. M. Hasan', 'Z. Xie', 'N. Sakib']);
    assert.match(String(entry.fields.booktitle), /connected health/i); // the parser sentence-cases; the file keeps the original case
  });

  it('maps the journal articles with volume, issue and pages', () => {
    const military = entryOf(toBibtex(byId('digimindready-2026')));
    assert.equal(military.type, 'article');
    assert.equal(military.fields.journal, 'Military Medicine');
    assert.equal(military.fields.volume, '191');
    assert.equal(military.fields.number, '9–10');
    assert.equal(military.fields.pages, 'e2039–e2048');
    assert.equal(military.fields.doi, '10.1093/milmed/usag101');
    assert.deepEqual(authorsOf(toBibtex(byId('digimindready-2026'))), [
      'Md Mehedi Hasan',
      'Md Fazle Rabbi Rahat',
      'Nafisa Anjum',
      'Nazmus Sakib',
      'Brian A. Moore',
    ]);
  });

  it('keeps an article number out of the page range', () => {
    const bibtex = toBibtex(byId('vaccination-uptake-2026'));
    const entry = entryOf(bibtex);
    assert.equal(entry.fields.pages, undefined);
    assert.equal(entry.fields.eid, '100665');
    assert.equal(entry.fields.volume, '41');
    assert.equal(entry.fields.doi, '10.1016/j.smhl.2026.100665');
  });

  it('protects case-sensitive terms in titles', () => {
    assert.match(toBibtex(byId('iomt-security-2025')), /Optimizing \{IoMT\} Security/);
    assert.match(toBibtex(byId('digimindready-2026')), /\{DigiMindReady\}: .*Edge \{AI\}-Driven.*\{mHealth\} Innovation/);
    assert.equal(protectTerms('LLMs and {LLM} for AI'), '{LLMs} and {LLM} for {AI}');
    assert.equal(protectTerms('MAIN'), 'MAIN');
  });

  it('escapes BibTeX markup and converts dashes', () => {
    assert.equal(escapeBibtex('R&D 50% of #1_a'), 'R\\&D 50\\% of \\#1\\_a');
    assert.equal(escapeBibtex('e1–e9'), 'e1--e9');
  });

  it('produces a complete file that parses to one entry per record, in order', () => {
    const ordered = [...publications].sort(comparePublications);
    const result = parse(toBibtexFile(ordered));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      result.entries.map((entry) => entry.key),
      ['hasan2026digimindready', 'hasan2026vaccination', 'rahat2025iomt'],
    );
  });

  it('is deterministic', () => {
    assert.equal(toBibtexFile(publications), toBibtexFile([...publications]));
  });
});

describe('display helpers', () => {
  it('orders newest year first, then by sortOrder', () => {
    assert.deepEqual(
      [...publications].sort(comparePublications).map((publication) => publication.id),
      ['digimindready-2026', 'vaccination-uptake-2026', 'iomt-security-2025'],
    );
  });

  it('formats volume, issue, pages and article numbers distinctly', () => {
    assert.equal(volumeAndPages(byId('digimindready-2026')), '191(9–10), e2039–e2048');
    assert.equal(volumeAndPages(byId('vaccination-uptake-2026')), '41, article 100665');
    assert.equal(volumeAndPages(byId('iomt-security-2025')), '371–376');
  });
});

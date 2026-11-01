import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { areaSlug, areaSlugs } from '../../src/lib/areas.ts';
import { loadRawContent } from '../../scripts/lib/content-files.mjs';

describe('research areas', () => {
  it('turns wording into a stable URL key', () => {
    assert.equal(areaSlug('large language models'), 'large-language-models');
    assert.equal(areaSlug('AI security and reliability'), 'ai-security-and-reliability');
    assert.equal(areaSlug('  Smart  Healthcare! '), 'smart-healthcare');
    assert.equal(areaSlug('Résumé-ready AI'), 'resume-ready-ai');
    assert.equal(areaSlug('???'), '');
  });

  it('matches a term and a project area however they are capitalised', () => {
    assert.equal(areaSlug('Multimodal agentic AI'), areaSlug('multimodal agentic ai'));
  });

  it('lists a project\'s areas in order without repeats', () => {
    assert.deepEqual(areaSlugs(['Smart healthcare', 'smart  healthcare', 'NLP']), ['smart-healthcare', 'nlp']);
    assert.deepEqual(areaSlugs(undefined), []);
  });

  it('gives every research term highlighted in the biography at least one tagged project', () => {
    const raw = loadRawContent();
    const bio: string = raw.profile.bioShort.join(' ');
    const lists = [bio.match(/research focuses on ([^.]+)/i)?.[1], bio.match(/(?:worked|work) in the field of ([^.]+)/i)?.[1]];
    const terms = lists.flatMap((list) => (list ? list.split(list.includes(',') ? /,\s*(?:and\s+)?/i : /\s+and\s+/i) : [])).map((term) => term.trim());
    assert.ok(terms.length >= 4, 'expected the biography to name its research areas');
    const tagged = new Set(raw.research.filter((entry) => !entry.data.draft).flatMap((entry) => areaSlugs(entry.data.areas)));
    for (const term of terms) assert.ok(tagged.has(areaSlug(term)), `no research project is tagged "${term}"`);
  });
});

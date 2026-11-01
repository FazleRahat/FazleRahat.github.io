import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateContent, type FileProbe, type Issue, type RawContent } from '../../src/lib/validate.ts';
import { loadRawContent } from '../../scripts/lib/content-files.mjs';

const pristine = (): RawContent => structuredClone(loadRawContent()) as RawContent;
// The validator rejects review dates after "today", so this follows the shipped content.
const TODAY = (pristine().profile as { contentReviewedOn: string }).contentReviewedOn;
const run =(raw: RawContent, files?: FileProbe): Issue[] => validateContent(raw, { today: TODAY, ...(files ? { files } : {}) }).issues;
const errors = (issues: Issue[]) => issues.filter((issue) => issue.level === 'error');
const messages = (issues: Issue[]) => errors(issues).map((issue) => `${issue.where}: ${issue.message}`).join('\n');

// Loosely typed mutation helpers: the validator under test is what checks the shapes.
const publication = (raw: RawContent, id: string) => (raw.publications as Record<string, any>[]).find((p) => p.id === id)!;
const research = (raw: RawContent, id: string) => raw.research.find((r) => r.id === id)! as { data: Record<string, any>; body: string };

describe('validateContent', () => {
  it('accepts the shipped content', () => {
    assert.deepEqual(errors(run(pristine())), []);
  });

  it('still requires teaching responsibilities when research highlights are omitted', () => {
    const raw = pristine();
    const appointment = (raw.experience as Record<string, any>[]).find((role) => role.kind === 'teaching')!;
    delete appointment.highlights;
    assert.match(messages(run(raw)), /Teaching appointments need at least one responsibility/);
  });

  it('requires compact copy for featured research while other summaries can be omitted', () => {
    const raw = pristine();
    delete research(raw, 'digimindready').data.summary;
    assert.match(messages(run(raw)), /Featured research needs a compact summary/);
  });

  it('rejects research areas that repeat or cannot make a link', () => {
    const repeated = pristine();
    research(repeated, 'goldenvaxshield').data.areas = ['smart healthcare', 'Smart Healthcare'];
    assert.match(messages(run(repeated)), /areas lists the same area twice/);

    const empty = pristine();
    research(empty, 'goldenvaxshield').data.areas = ['???'];
    assert.match(messages(run(empty)), /area "\?\?\?" has no letters or digits/);
  });

  it('rejects duplicate DOIs, ids and citation keys', () => {
    const raw = pristine();
    publication(raw, 'vaccination-uptake-2026').doi = publication(raw, 'digimindready-2026').doi;
    publication(raw, 'vaccination-uptake-2026').citationKey = publication(raw, 'digimindready-2026').citationKey;
    const text = messages(run(raw));
    assert.match(text, /doi.*more than once/);
    assert.match(text, /citationKey.*more than once/);
  });

  it('requires exactly one self-author matched by personId', () => {
    const none = pristine();
    for (const author of publication(none, 'iomt-security-2025').authors) delete author.personId;
    assert.match(messages(run(none)), /exactly one author with personId "rahat", found 0/);

    const two = pristine();
    publication(two, 'iomt-security-2025').authors[1].personId = 'rahat';
    assert.match(messages(run(two)), /found 2/);
  });

  it('keeps cross references consistent and resolvable', () => {
    const missing = pristine();
    publication(missing, 'iomt-security-2025').researchId = 'does-not-exist';
    assert.match(messages(run(missing)), /researchId "does-not-exist" does not exist/);

    const oneWay = pristine();
    research(oneWay, 'iomt-security-review').data.publicationIds = [];
    assert.match(messages(run(oneWay)), /does not list this publication/);

    const unknown = pristine();
    research(unknown, 'digimindready').data.publicationIds.push('ghost-2030');
    assert.match(messages(run(unknown)), /unknown publication "ghost-2030"/);
  });

  it('refuses links from public content to a draft record', () => {
    const raw = pristine();
    research(raw, 'digimindready').data.draft = true;
    assert.match(messages(run(raw)), /is a draft and cannot be linked from public content/);
  });

  it('keeps a proposed thesis ongoing', () => {
    const raw = pristine();
    research(raw, 'hydroponic-decision-support').data.status = 'completed';
    assert.match(messages(run(raw)), /proposed MS thesis must remain status: ongoing/);
  });

  it('keeps expected graduation separate from an actual end date', () => {
    const raw = pristine();
    (raw.education as Record<string, any>[])[0]!.end = '2027-07';
    assert.match(messages(run(raw)), /either end \(actual\) or expectedEnd/);
  });

  it('rejects impossible dates, placeholder text and unknown fields', () => {
    const raw = pristine();
    (raw.experience as Record<string, any>[])[0]!.start = '2026-02-30';
    research(raw, 'goldenvaxshield').data.blurb += ' TODO finish this';
    (raw.teaching as Record<string, any>[])[0]!.surprise = true;
    const text = messages(run(raw));
    assert.match(text, /real date/);
    assert.match(text, /placeholder text found/);
    assert.match(text, /surprise/);
  });

  it('only allows https links and DOI identifiers', () => {
    const raw = pristine();
    (raw.profile as Record<string, any>).links.github = 'http://github.invalid/x';
    publication(raw, 'iomt-security-2025').doi = 'https://doi.org/10.1145/3721201.3724412';
    const text = messages(run(raw));
    assert.match(text, /https URL/);
    assert.match(text, /DOI identifier only/);
  });

  it('requires verified public use before a manuscript PDF can ship', () => {
    const raw = pristine();
    publication(raw, 'iomt-security-2025').pdf = { path: '/files/paper.pdf', version: 'author', publicUseVerified: false };
    assert.match(messages(run(raw)), /publicUseVerified: true/);
  });

  it('checks local files against the recorded CV manifest', () => {
    const raw = pristine();
    const profile = raw.profile as { cv: { bytes: number; sha256: string } };
    const good: FileProbe = { exists: () => true, size: () => profile.cv.bytes, sha256: () => profile.cv.sha256 };
    assert.deepEqual(errors(run(raw, good)), []);

    assert.match(messages(run(raw, { ...good, exists: () => false })), /not found under public/);
    assert.match(messages(run(raw, { ...good, size: () => 0 })), /empty/);
    assert.match(messages(run(raw, { ...good, size: () => 1234 })), /cv\.bytes/);
    assert.match(messages(run(raw, { ...good, sha256: () => 'f'.repeat(64) })), /cv\.sha256/);
  });

  it('fails when a configured portrait file is missing and passes when it exists', () => {
    const raw = pristine();
    (raw.profile as Record<string, any>).portrait = { src: 'portrait/portrait.jpg', alt: 'Portrait of the author' };
    const profile = raw.profile as { cv: { bytes: number; sha256: string } };
    const probe = (portraitExists: boolean): FileProbe => ({
      exists: (path) => (path.startsWith('src/assets/') ? portraitExists : true),
      size: () => profile.cv.bytes,
      sha256: () => profile.cv.sha256,
    });
    assert.match(messages(run(raw, probe(false))), /portrait "portrait\/portrait\.jpg" not found/);
    assert.deepEqual(errors(run(raw, probe(true))), []);
  });

  it('flags an expired availability statement and a passed expectedEnd as warnings, not errors', () => {
    const raw = pristine();
    Object.assign(raw.site as Record<string, any>, { showPhdAvailability: true, availabilityExpiresOn: '2026-01-01' });
    const issues = run(raw);
    assert.deepEqual(errors(issues), []);
    assert.ok(issues.some((issue) => issue.level === 'warning' && /expired/.test(issue.message)));
  });

  describe('talks and events', () => {
    const sample = (overrides: Record<string, unknown> = {}) => ({
      id: 'chase-2025-talk',
      title: 'Presenting the IoMT scoping review',
      type: 'conference-presentation',
      role: 'Presenter',
      event: 'ACM/IEEE CHASE 2025',
      start: '2025-06',
      links: {},
      draft: false,
      reviewedOn: '2026-10-16',
      ...overrides,
    });
    const withEvents = (...events: Record<string, unknown>[]) => {
      const raw = pristine();
      raw.events = events;
      return raw;
    };

    it('accepts a well-formed event, with and without optional fields', () => {
      assert.deepEqual(errors(run(withEvents(sample()))), []);
      const full = sample({
        id: 'seminar-2026',
        type: 'invited-talk',
        start: '2026-03-10',
        end: '2026-03-10',
        location: 'Online',
        summary: 'A short description.',
        publicationId: 'iomt-security-2025',
        researchId: 'iomt-security-review',
        links: { slides: 'https://slides.invalid/deck', event: 'https://events.invalid/talk' },
      });
      assert.deepEqual(errors(run(withEvents(full))), []);
    });

    it('rejects duplicate ids, impossible dates and an end before the start', () => {
      assert.match(messages(run(withEvents(sample(), sample()))), /events\.json id.*more than once/);
      assert.match(messages(run(withEvents(sample({ start: '2025-02-30' })))), /real date/);
      assert.match(messages(run(withEvents(sample({ start: '2025-06-10', end: '2025-06-02' })))), /start is after end/);
    });

    it('rejects unknown types, unknown fields and non-https links', () => {
      assert.match(messages(run(withEvents(sample({ type: 'keynote' })))), /type/);
      assert.match(messages(run(withEvents(sample({ surprise: 1 })))), /surprise/);
      assert.ok(errors(run(withEvents(sample({ links: { slides: 'http://slides.invalid/x' } })))).length > 0);
    });

    it('keeps references resolvable and out of drafts', () => {
      assert.match(messages(run(withEvents(sample({ publicationId: 'ghost-2030' })))), /publicationId "ghost-2030" does not exist/);
      assert.match(messages(run(withEvents(sample({ researchId: 'ghost' })))), /researchId "ghost" does not exist/);
      const raw = withEvents(sample({ publicationId: 'iomt-security-2025' }));
      publication(raw, 'iomt-security-2025').draft = true;
      assert.match(messages(run(raw)), /is a draft and cannot be linked/);
    });

    it('flags placeholder text and missing hosted files', () => {
      assert.match(messages(run(withEvents(sample({ title: 'TBD talk' })))), /placeholder text found/);
      const raw = withEvents(sample({ links: { slides: '/files/slides.pdf' } }));
      const profile = raw.profile as { cv: { bytes: number; sha256: string } };
      const probe = (exists: boolean): FileProbe => ({
        exists: (path) => (path === 'public/files/slides.pdf' ? exists : true),
        size: () => profile.cv.bytes,
        sha256: () => profile.cv.sha256,
      });
      assert.match(messages(run(raw, probe(false))), /links\.slides "\/files\/slides\.pdf" not found/);
      assert.deepEqual(errors(run(raw, probe(true))), []);
    });
  });
});

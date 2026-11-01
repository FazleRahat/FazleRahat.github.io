import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUrls } from '../../src/lib/urls.ts';
import { homeJsonLd, publicationsJsonLd, serializeJsonLd } from '../../src/lib/structured-data.ts';
import { profileSchema, publicationSchema } from '../../src/lib/schemas.ts';
import { loadRawContent } from '../../scripts/lib/content-files.mjs';

const raw = loadRawContent();
const profile = profileSchema.parse(raw.profile);
const publications = raw.publications.map((record: unknown) => publicationSchema.parse(record));
const { absolute } = createUrls({ base: '/portfolio/', origin: 'https://site.invalid' });
const site = { siteName: 'Name', defaultDescription: 'Description' };

describe('JSON-LD', () => {
  it('cannot close the script element', () => {
    const text = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    assert.ok(!text.includes('</script>'));
    assert.deepEqual(JSON.parse(text), { name: '</script><script>alert(1)</script>' });
  });

  it('only lists verified profile URLs in sameAs', () => {
    const person = (homeJsonLd(profile, site, absolute)['@graph'] as Record<string, unknown>[]).find((node) => node['@type'] === 'Person');
    assert.deepEqual(person?.sameAs, Object.values(profile.links));
    assert.ok(!JSON.stringify(person).includes('github'));
    assert.equal(person?.['@id'], 'https://site.invalid/portfolio/#person');
  });

  it('omits sameAs when there are no profile links', () => {
    const bare = { ...profile, links: {} };
    const person = (homeJsonLd(bare, site, absolute)['@graph'] as Record<string, unknown>[]).find((node) => node['@type'] === 'Person');
    assert.equal('sameAs' in (person ?? {}), false);
  });

  it('takes the job title from the current appointment and omits it when there is none', () => {
    const person = (jobTitle?: string) => (homeJsonLd(profile, site, absolute, jobTitle)['@graph'] as Record<string, unknown>[]).find((node) => node['@type'] === 'Person');
    assert.equal(person('Research Scientist')?.jobTitle, 'Research Scientist');
    assert.equal('jobTitle' in (person() ?? {}), false);
  });

  it('describes each publication with its DOI and links the self author to the person', () => {
    const list = publicationsJsonLd(publications, absolute) as { itemListElement: { item: Record<string, any> }[] };
    assert.equal(list.itemListElement.length, 3);
    const first = list.itemListElement[0]!.item;
    assert.equal(first.identifier.value, publications[0].doi);
    assert.equal(first.datePublished, String(publications[0].year));
    assert.ok(first.author.some((author: Record<string, string>) => author['@id'] === 'https://site.invalid/portfolio/#person'));
  });
});

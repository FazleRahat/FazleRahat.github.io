import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUrls, normalizeBase, routeOf } from '../../src/lib/urls.ts';

describe('createUrls', () => {
  const root = createUrls({ base: '/', origin: 'https://site.invalid/' });
  const sub = createUrls({ base: '/portfolio', origin: 'https://site.invalid' });

  it('prefixes internal paths with the base', () => {
    assert.equal(root.withBase('/research/'), '/research/');
    assert.equal(sub.withBase('/research/'), '/portfolio/research/');
    assert.equal(sub.withBase('files/cv.pdf'), '/portfolio/files/cv.pdf');
    assert.equal(sub.withBase('/'), '/portfolio/');
  });

  it('leaves external URLs and fragments untouched', () => {
    assert.equal(sub.withBase('https://doi.org/10.1/x'), 'https://doi.org/10.1/x');
    assert.equal(sub.withBase('mailto:a@b.co'), 'mailto:a@b.co');
    assert.equal(sub.withBase('#contact'), '#contact');
  });

  it('builds absolute canonical URLs without doubled slashes', () => {
    assert.equal(root.absolute('/'), 'https://site.invalid/');
    assert.equal(sub.absolute('/publications/'), 'https://site.invalid/portfolio/publications/');
    assert.equal(sub.absolute('/social/default.png'), 'https://site.invalid/portfolio/social/default.png');
  });

  it('normalizes bases', () => {
    assert.equal(normalizeBase(''), '/');
    assert.equal(normalizeBase('repo'), '/repo/');
    assert.equal(normalizeBase('/repo//'), '/repo/');
  });
});

describe('routeOf', () => {
  it('strips the base and normalizes the trailing slash', () => {
    assert.equal(routeOf('/portfolio/research/x/', '/portfolio/'), '/research/x/');
    assert.equal(routeOf('/research', '/'), '/research/');
    assert.equal(routeOf('/portfolio/', '/portfolio/'), '/');
    assert.equal(routeOf('/publications.bib', '/'), '/publications.bib');
  });
});

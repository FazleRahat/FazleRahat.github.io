import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeBase, resolveSiteConfig } from '../../site.config.mjs';

describe('resolveSiteConfig', () => {
  it('defaults to a noindex-style preview on localhost', () => {
    const config = resolveSiteConfig({});
    assert.deepEqual(config, { environment: 'preview', origin: 'http://localhost:4321', base: '/' });
  });

  it('treats the dev command as development', () => {
    assert.equal(resolveSiteConfig({}, { dev: true }).environment, 'development');
  });

  it('requires a real https origin for production', () => {
    assert.throws(() => resolveSiteConfig({ SITE_ENV: 'production' }), /HTTPS origin/);
    assert.throws(() => resolveSiteConfig({ SITE_ENV: 'production', SITE_ORIGIN: 'http://real.invalid' }), /https/);
    assert.throws(() => resolveSiteConfig({ SITE_ENV: 'production', SITE_ORIGIN: 'https://localhost:4321' }), /placeholder/);
    assert.throws(() => resolveSiteConfig({ SITE_ENV: 'production', SITE_ORIGIN: 'https://example.com' }), /placeholder/);
    assert.throws(() => resolveSiteConfig({ SITE_ENV: 'production', SITE_ORIGIN: 'https://real.invalid/sub' }), /origin only/);
  });

  it('accepts a production origin and a repository sub-path', () => {
    const config = resolveSiteConfig({ SITE_ENV: 'production', SITE_ORIGIN: 'https://real.invalid/', SITE_BASE: 'portfolio' });
    assert.deepEqual(config, { environment: 'production', origin: 'https://real.invalid', base: '/portfolio/' });
  });

  it('rejects unknown environments and malformed bases', () => {
    assert.throws(() => resolveSiteConfig({ SITE_ENV: 'staging' }));
    assert.throws(() => normalizeBase('/a b/'));
  });

  it('normalizes a base with or without its outer slashes', () => {
    for (const base of ['repo', '/repo', 'repo/', '/repo/']) assert.equal(normalizeBase(base), '/repo/');
    assert.equal(normalizeBase('a/b'), '/a/b/');
    assert.equal(normalizeBase(' / '), '/');
  });

  it('rejects dot segments and empty segments in a base', () => {
    for (const base of ['../..', '/a/../b', './a', '/a//b/', '//']) assert.throws(() => normalizeBase(base), /not a valid path/);
  });

  it('rejects a long invalid base without slowing down', () => {
    const started = performance.now();
    assert.throws(() => normalizeBase(`${'a'.repeat(50_000)}!`), /not a valid path/);
    assert.ok(performance.now() - started < 1000);
  });
});

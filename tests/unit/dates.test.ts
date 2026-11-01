import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dateKey,
  formatBytes,
  formatDateRange,
  formatEducationPeriod,
  formatPartialDate,
  formatPeriod,
  formatReviewDate,
  isFullDate,
  isPartialDate,
  termKey,
} from '../../src/lib/dates.ts';

describe('partial dates', () => {
  it('accepts only real dates at the stated precision', () => {
    for (const ok of ['2026', '2026-01', '2026-02-28', '2028-02-29']) assert.ok(isPartialDate(ok), ok);
    for (const bad of ['2026-13', '2026-00', '2026-02-30', '2027-02-29', '26-01', 'July 2027', '']) {
      assert.equal(isPartialDate(bad), false, bad);
    }
  });

  it('does not promote a month to a day', () => {
    assert.equal(formatPartialDate('2026-01'), 'January 2026');
    assert.equal(formatPartialDate('2026'), '2026');
    assert.equal(formatPartialDate('2026-10-16'), 'October 16, 2026');
    assert.equal(isFullDate('2026-01'), false);
  });

  it('formats open and closed periods', () => {
    assert.equal(formatPeriod('2026-01', null), 'January 2026 – present');
    assert.equal(formatPeriod('2024-01', '2025-07'), 'January 2024 – July 2025');
  });

  it('keeps an expected end distinct from an actual end', () => {
    assert.equal(formatEducationPeriod('2026-01', undefined, '2027-07'), 'January 2026 – Expected July 2027');
    assert.equal(formatEducationPeriod('2020-02', '2025-08'), 'February 2020 – August 2025');
  });

  it('orders dates chronologically', () => {
    assert.ok(dateKey('2026-01') > dateKey('2025-12'));
    assert.ok(dateKey('2026-01') > dateKey('2026'));
  });

  it('renders review dates without a time zone shift', () => {
    assert.equal(formatReviewDate('2026-10-16'), 'October 16, 2026');
    assert.throws(() => formatReviewDate('2026-10'));
  });
});

describe('terms and sizes', () => {
  it('orders terms by the calendar, not alphabetically', () => {
    assert.ok(termKey({ year: 2026, term: 'Fall' }) > termKey({ year: 2026, term: 'Summer' }));
    assert.ok(termKey({ year: 2026, term: 'Summer' }) > termKey({ year: 2026, term: 'Spring' }));
    assert.ok(termKey({ year: 2027, term: 'Spring' }) > termKey({ year: 2026, term: 'Fall' }));
  });

  it('formats file sizes', () => {
    assert.equal(formatBytes(176835), '173 KB');
    assert.equal(formatBytes(512), '512 B');
  });
});

describe('date ranges', () => {
  it('collapses ranges at the precision supplied', () => {
    assert.equal(formatDateRange('2025-06'), 'June 2025');
    assert.equal(formatDateRange('2025-06-24', '2025-06-24'), 'June 24, 2025');
    assert.equal(formatDateRange('2025-06-24', '2025-06-27'), 'June 24–27, 2025');
    assert.equal(formatDateRange('2025-06-30', '2025-07-02'), 'June 30, 2025 – July 2, 2025');
    assert.equal(formatDateRange('2025-05', '2025-06'), 'May – June 2025');
    assert.equal(formatDateRange('2025', '2026'), '2025 – 2026');
  });
});

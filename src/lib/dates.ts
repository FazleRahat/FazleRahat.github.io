// Date helpers that respect the precision a source actually states.
// A year-only or year-month value is never silently promoted to a full date.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type PartialDate = { year: number; month?: number; day?: number };

const PARTIAL = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parsePartialDate(value: string): PartialDate | null {
  const match = PARTIAL.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && month !== undefined) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) return null;
  }
  return { year, ...(month === undefined ? {} : { month }), ...(day === undefined ? {} : { day }) };
}

export const isPartialDate = (value: string): boolean => parsePartialDate(value) !== null;

export const isFullDate = (value: string): boolean => {
  const parsed = parsePartialDate(value);
  return parsed?.day !== undefined;
};

function parseOrThrow(value: string): PartialDate {
  const parsed = parsePartialDate(value);
  if (!parsed) throw new Error(`Invalid date "${value}". Use YYYY, YYYY-MM or YYYY-MM-DD.`);
  return parsed;
}

/** "2026" | "January 2026" | "January 5, 2026" */
export function formatPartialDate(value: string): string {
  const { year, month, day } = parseOrThrow(value);
  if (month === undefined) return String(year);
  const name = MONTHS[month - 1];
  return day === undefined ? `${name} ${year}` : `${name} ${day}, ${year}`;
}

/**
 * A date or date range at the precision supplied:
 * "June 2025", "June 24–27, 2025", "June 30 – July 2, 2025", "May – June 2025".
 */
export function formatDateRange(start: string, end?: string): string {
  if (!end || end === start) return formatPartialDate(start);
  const a = parseOrThrow(start);
  const b = parseOrThrow(end);
  const sameMonth = a.year === b.year && a.month !== undefined && a.month === b.month;
  if (sameMonth && a.day !== undefined && b.day !== undefined) {
    return `${MONTHS[a.month! - 1]} ${a.day}–${b.day}, ${a.year}`;
  }
  if (a.year === b.year && a.day === undefined && b.day === undefined && a.month !== undefined && b.month !== undefined) {
    return `${MONTHS[a.month - 1]} – ${MONTHS[b.month - 1]} ${a.year}`;
  }
  return `${formatPartialDate(start)} – ${formatPartialDate(end)}`;
}

/** Compact month form used in dense lists: "Jan 2026". */
export function formatPartialDateShort(value: string): string {
  const { year, month } = parseOrThrow(value);
  if (month === undefined) return String(year);
  return `${MONTHS[month - 1]?.slice(0, 3)} ${year}`;
}

/** A period whose end may be open: "January 2026 – present". */
export function formatPeriod(start: string, end: string | null | undefined, presentLabel = 'present'): string {
  const from = formatPartialDate(start);
  const to = end ? formatPartialDate(end) : presentLabel;
  return `${from} – ${to}`;
}

/** Education keeps an actual end separate from an expected one. */
export function formatEducationPeriod(start: string, end?: string, expectedEnd?: string): string {
  if (end) return formatPeriod(start, end);
  if (expectedEnd) return `${formatPartialDate(start)} – Expected ${formatPartialDate(expectedEnd)}`;
  return `${formatPartialDate(start)} – present`;
}

/** Descending comparison key; missing months sort as if before January. */
export function dateKey(value: string): number {
  const { year, month = 0, day = 0 } = parseOrThrow(value);
  return year * 10_000 + month * 100 + day;
}

export const TERM_ORDER = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 } as const;
export type Term = keyof typeof TERM_ORDER;

/** Orders academic terms chronologically (never alphabetically). */
export function termKey(term: { year: number; term: Term }): number {
  return term.year * 10 + TERM_ORDER[term.term];
}

export const formatTerm = (term: { year: number; term: Term }): string => `${term.term} ${term.year}`;

/** Review dates are YYYY-MM-DD; render in UTC so the day never shifts by time zone. */
export function formatReviewDate(value: string): string {
  if (!isFullDate(value)) throw new Error(`Review date must be YYYY-MM-DD (received "${value}").`);
  return formatPartialDate(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

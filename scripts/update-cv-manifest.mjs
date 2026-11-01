// Records the size and SHA-256 of the public CV in profile.json after the PDF is
// deliberately replaced. reviewedOn stays author-maintained: pass --reviewed YYYY-MM-DD.
//   pnpm cv:manifest -- --reviewed 2026-10-16
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/content-files.mjs';

const profilePath = join(ROOT, 'src/data/profile.json');
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const pdfPath = join(ROOT, 'public', profile.cv.path);

const bytes = statSync(pdfPath).size;
const sha256 = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
if (readFileSync(pdfPath).subarray(0, 5).toString() !== '%PDF-') throw new Error(`${profile.cv.path} is not a PDF`);

const reviewedIndex = process.argv.indexOf('--reviewed');
const reviewedOn = reviewedIndex > -1 ? process.argv[reviewedIndex + 1] : profile.cv.reviewedOn;
if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)) throw new Error('--reviewed must be YYYY-MM-DD');

const changed = profile.cv.bytes !== bytes || profile.cv.sha256 !== sha256 || profile.cv.reviewedOn !== reviewedOn;
profile.cv = { ...profile.cv, bytes, sha256, reviewedOn };
writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
console.log(changed ? `Updated CV manifest: ${bytes} bytes, ${sha256}` : 'CV manifest already current.');

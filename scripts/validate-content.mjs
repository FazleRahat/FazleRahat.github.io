// Validates every content record and its relationships. Exits non-zero on errors.
//   pnpm validate:content
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadRawContent } from './lib/content-files.mjs';
import { validateContent } from '../src/lib/validate.ts';

const abs = (path) => join(ROOT, path);
const files = {
  exists: (path) => existsSync(abs(path)),
  size: (path) => statSync(abs(path)).size,
  sha256: (path) => createHash('sha256').update(readFileSync(abs(path))).digest('hex'),
};

const today = new Date().toISOString().slice(0, 10);
const { issues } = validateContent(loadRawContent(), { files, today });

const errors = issues.filter((issue) => issue.level === 'error');
const warnings = issues.filter((issue) => issue.level === 'warning');

for (const issue of warnings) console.warn(`warning  ${issue.where}: ${issue.message}`);
for (const issue of errors) console.error(`error    ${issue.where}: ${issue.message}`);

if (errors.length > 0) {
  console.error(`\nContent validation failed: ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`Content validation passed (${warnings.length} warning${warnings.length === 1 ? '' : 's'}).`);

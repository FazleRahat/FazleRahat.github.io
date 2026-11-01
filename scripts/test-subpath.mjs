// Proves the site works under a repository sub-path and a production origin:
// builds into dist-subpath, checks the output, serves it under /portfolio/ and runs
// the smoke suite against that URL. The origin is a reserved ".invalid" host, so
// nothing here can resemble a real deployment.
//   pnpm test:subpath
import { spawn, spawnSync } from 'node:child_process';
import { ROOT } from './lib/content-files.mjs';

const env = {
  ...process.env,
  SITE_ENV: 'production',
  SITE_ORIGIN: 'https://portfolio-test.invalid',
  SITE_BASE: '/portfolio/',
};
const run = (command, args, extra = {}) => spawnSync(command, args, { cwd: ROOT, env: { ...env, ...extra }, stdio: 'inherit' });
const must = (result, label) => {
  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(result.status ?? 1);
  }
};

must(run('pnpm', ['validate:content']), 'Content validation');
must(run('pnpm', ['exec', 'astro', 'build', '--outDir', 'dist-subpath']), 'Sub-path build');
must(run('node', ['--disable-warning=ExperimentalWarning', 'scripts/check-output.mjs', '--dist', 'dist-subpath']), 'Output check');

const port = 4394;
const server = spawn('node', ['scripts/serve-dist.mjs', '--dir', 'dist-subpath', '--base', '/portfolio/', '--port', String(port)], { cwd: ROOT, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 800));
// A server that has already exited usually means the port is taken; testing whatever holds it would prove nothing.
if (server.exitCode !== null) {
  console.error(`\nThe sub-path server could not start. Is something already using port ${port}?`);
  process.exit(1);
}
let smoke;
try {
  smoke = run('pnpm', ['exec', 'playwright', 'test', 'tests/smoke.spec.ts'], { E2E_BASE_URL: `http://localhost:${port}/portfolio/` });
} finally {
  // Stopped before reporting the result: must() exits the process, which would skip this.
  server.kill();
}
must(smoke, 'Smoke tests under the sub-path');
console.log('\nSub-path deployment checks passed.');

/**
 * Runs the integration suites against a THROWAWAY database: for each suite it starts the API on its own port with the settings
 * that suite documents, runs the tests, and stops the API.
 *
 *   npm run test:integration:all                      all suites
 *   npm run test:integration:all -- workflows admin   only these
 *
 * Needs TEST_DATABASE_URL: a PostgreSQL database whose NAME ends in "_test" that has had `prisma migrate deploy` and `npm run seed`
 * applied. The script refuses any other database name, so it can never run against the development or production data.
 * Example: postgresql://postgres:PASSWORD@localhost:5432/shree_hari_test?schema=public
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const DB = process.env.TEST_DATABASE_URL;
if (!DB) {
  console.error('TEST_DATABASE_URL is not set. See the header of scripts/run-integration.cjs.');
  process.exit(2);
}
const dbName = (() => { try { return new URL(DB).pathname.replace(/^\//, ''); } catch { return ''; } })();
if (!/_test$/.test(dbName)) {
  console.error(`Refusing to run: the database "${dbName}" does not end in "_test". These suites create and change data.`);
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const JWT_SECRET = process.env.TEST_JWT_SECRET ?? 'integration-test-secret-not-for-real-use-0123456789';
const COMMON = { OTP_PROVIDER: 'dev', EMAIL_PROVIDER: 'dev', PAYMENT_PROVIDER: 'test', AUTH_RATE_LIMIT_PER_MIN: '500', ADMIN_LOGIN_RATE_LIMIT: '1000', CHECKOUT_RATE_LIMIT_PER_MIN: '1000' };
const SUITES = {
  integration: { file: 'api.integration.test.ts', port: 4011, env: { AUTH_RATE_LIMIT_PER_MIN: '500', CHECKOUT_RATE_LIMIT_PER_MIN: '1000' } },
  flows: { file: 'flows.integration.test.ts', port: 4012, env: { ...COMMON, OTP_RESEND_COOLDOWN_SECONDS: '1', OTP_MAX_ATTEMPTS: '3', OTP_HOURLY_LIMIT: '100' } },
  admin: { file: 'admin.integration.test.ts', port: 4013, env: { ...COMMON, ENABLE_DEMO_LOGIN: 'true' } },
  workflows: { file: 'workflows.integration.test.ts', port: 4014, env: COMMON },
  sync: { file: 'sync.integration.test.ts', port: 4015, env: COMMON },
  verify: { file: 'verify.integration.test.ts', port: 4016, env: { EMAIL_PROVIDER: 'dev', AUTH_RATE_LIMIT_PER_MIN: '500' } },
  regression: { file: 'regression.integration.test.ts', port: 4017, env: { ...COMMON, OTP_RESEND_COOLDOWN_SECONDS: '1', OTP_HOURLY_LIMIT: '100' } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, env, opts = {}) => spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: opts.stdio ?? 'inherit' });

async function waitHealthy(port) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return true; } catch { /* not up yet */ }
    await sleep(1000);
  }
  return false;
}

async function runSuite(name) {
  const s = SUITES[name];
  const base = { DATABASE_URL: DB, JWT_SECRET, PORT: String(s.port), NODE_ENV: 'development', ...s.env };
  console.log(`\n=== ${name}: starting the API on port ${s.port} (database ${dbName})`);
  const api = run('node', ['--import', 'tsx', 'src/server.ts'], base, { stdio: 'ignore' });
  try {
    if (!(await waitHealthy(s.port))) { console.error(`${name}: the API did not start`); return false; }
    const code = await new Promise((resolve) => {
      const t = run('node', ['--import', 'tsx', '--test', `src/integration/${s.file}`], { ...base, API_URL: `http://localhost:${s.port}/api` });
      t.on('exit', resolve);
    });
    return code === 0;
  } finally {
    api.kill();
    await sleep(500);
  }
}

(async () => {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SUITES);
  const unknown = wanted.filter((w) => !SUITES[w]);
  if (unknown.length) { console.error(`Unknown suite(s): ${unknown.join(', ')}. Known: ${Object.keys(SUITES).join(', ')}`); process.exit(2); }
  const results = {};
  for (const w of wanted) results[w] = await runSuite(w);
  console.log('\n=== Summary');
  for (const [k, v] of Object.entries(results)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  process.exit(Object.values(results).every(Boolean) ? 0 : 1);
})();

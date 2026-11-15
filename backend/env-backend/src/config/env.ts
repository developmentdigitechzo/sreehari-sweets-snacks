import 'dotenv/config';
import { validateEnv, type Env } from './envSchema.js';

const result = validateEnv(process.env);
if (!result.ok) {
  // Fail fast with a readable list. Only variable NAMES and rules are printed, never values.
  console.error('Invalid environment configuration:\n' + result.problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}

export const env: Env = result.env;

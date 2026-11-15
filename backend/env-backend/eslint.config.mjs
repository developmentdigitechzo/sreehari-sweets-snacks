// Flat ESLint config for the Express/TypeScript backend.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'uploads/**', 'prisma/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-duplicate-imports': 'error',
    },
  },
  {
    // The seed script imports plain data from the mobile package and is intentionally loosely typed.
    files: ['prisma/seed.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/ban-ts-comment': 'off' },
  },
);

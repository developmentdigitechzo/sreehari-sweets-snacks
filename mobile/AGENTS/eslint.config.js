// Flat ESLint config. Base = Expo's recommended set (TypeScript, React, React Hooks, import checks).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Real mistakes are errors; style noise stays off.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'import/no-duplicates': 'error',
      // React-Compiler advisory rules, switched off individually (not whole rule sets):
      // - immutability: flags every Reanimated `sharedValue.value = x`, which is the library's documented API.
      // - set-state-in-effect: flags "reset local state when a prop/visibility changes" effects (sheets, forms),
      //   which are intentional here. Correctness rules (rules-of-hooks, exhaustive-deps, refs, static-components) stay on.
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);

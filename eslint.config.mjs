import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'apps/admin/.next*/**',
      '.worktrees/**',
      '.superpowers/**',
      '.expo/**',
      'content/fixtures/assets/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-control-regex': 'off',
      'no-loss-of-precision': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Flat config for the whole workspace.
 *
 * Rules are intentionally non-type-aware: type correctness is enforced by
 * `pnpm typecheck` (tsc), so ESLint stays fast and does not need a project
 * service spanning every workspace tsconfig.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      // The Python AI service: linted and formatted by Ruff, and its virtual
      // environment contains third-party JavaScript that is not ours.
      'apps/ai-service/**',
      'apps/web/vite.config.ts.timestamp-*',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared TypeScript conventions.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },

  // Backend + worker + packages run on Node.
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts', 'packages/**/*.ts', '*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // NestJS leans on decorators and parameter properties.
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
      // Nest resolves constructor dependencies from `design:paramtypes`
      // metadata, which TypeScript only emits for *value* imports. The rule
      // cannot see that, and "fixing" an injected class to `import type`
      // silently breaks dependency injection at runtime.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  // Frontend runs in the browser.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Tests.
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },

  // Must stay last so formatting rules are disabled.
  prettier,
);

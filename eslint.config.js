import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .claude/worktrees holds other sessions' full checkouts of this repo;
  // same exclusion vitest already has in vite.config.js.
  globalIgnores(['dist', '.claude/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // `_name` marks a parameter kept only for its position, and
      // `{ [col]: _drop, ...rest }` is how a key is stripped from an object.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  // Vercel functions, one-off maintenance scripts and build tooling run on
  // Node, and tests reach for Node's `global` to stub browser APIs. Linting
  // them with browser globals only reported every `process.env` read as
  // undefined, which buried the one real no-undef bug (#266) in noise.
  {
    files: ['api/**/*.{js,mjs}', 'tools/**/*.{js,mjs}', '*.{js,mjs}', '**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])

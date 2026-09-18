import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

/*
  Deliberately narrow: only rules that catch real bugs, no style opinions.

  The reason is concrete. Two of the four regressions in this codebase's September
  rewrite were things a linter finds in milliseconds and a build does not:
    • a reference to a variable that no longer existed, which crashed a whole page
      at runtime (`node --check` only sees syntax; Vite happily builds it);
    • an imported function shadowed by a local state setter with the same name, so
      the import was silently never called and a value stopped being saved.
  Both are `no-undef` and `no-shadow`.

  Style rules are left out on purpose: a lint run that reports a hundred cosmetic
  complaints trains everyone to ignore it, and then it catches nothing at all.
*/
export default [
  {
    ignores: [
      '**/node_modules/**',
      'frontend/dist/**',
      'backend/.localstore.json',
    ],
  },

  // ── Frontend: browser globals, JSX, React hooks ──────────────────────────
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-shadow': 'error',
      // A component referenced in JSX counts as used; without this the imports
      // of every component would be reported as dead.
      'no-unused-vars': ['error', {
        args: 'after-used',
        varsIgnorePattern: '^(_|[A-Z])',   // _deliberatelyUnused, and JSX component imports
        argsIgnorePattern: '^_',
        caughtErrors: 'none',              // `catch {}` is used all over on purpose
      }],
      'react-hooks/rules-of-hooks': 'error',
      // Dependency arrays: a warning, not an error. The codebase has deliberate
      // eslint-disable comments for effects that must run once; those now work.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ── Backend and tooling: node globals, no JSX ────────────────────────────
  {
    files: ['backend/**/*.js', 'api/**/*.js', 'frontend/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-shadow': 'error',
      'no-unused-vars': ['error', { args: 'after-used', varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // ── Service worker: its own global scope ─────────────────────────────────
  {
    files: ['frontend/public/sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: { ...js.configs.recommended.rules },
  },
]

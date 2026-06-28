// Pragmatic flat ESLint config for admin-kit (run via `npm run lint` -> eslint src).
//
// Goal: catch React Hooks mistakes and obvious JS/TS errors — NOT enforce style.
// We use the non-type-checked typescript-eslint preset (fast: no type-aware
// linting) and add zero formatting rules (no indent/quotes/semi), so linting
// never forces a mass reformat of existing source.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Never lint deps or the consumer-facing app template.
  { ignores: ['node_modules/**', 'template/**'] },

  // Obvious-error baselines.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Source rules. The `files` entry also tells `eslint src` to pick up .ts/.tsx.
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // React Hooks correctness: rules-of-hooks = error, exhaustive-deps = warn.
      ...reactHooks.configs.recommended.rules,
      // Catch accidental `var` (hoisting/scoping foot-guns). Note: ESLint's
      // no-var does NOT fire inside an ambient `declare global { var ... }` (TS
      // global augmentation legitimately needs `var`), so src/mongo.ts requires
      // no disable directive there.
      'no-var': 'error',
    },
  },
)

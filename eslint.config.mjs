import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const eslintConfig = [
  // Next.js recommended configs (flat config arrays)
  ...coreWebVitals,
  ...typescript,

  // Global rules
  {
    plugins: {
      'unused-imports': (await import('eslint-plugin-unused-imports')).default,
      import: (await import('eslint-plugin-import')).default,
    },
    rules: {
      // Console warnings (good for production code)
      'no-console': 'warn',

      // TypeScript rules
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],

      // Unused imports auto-removal
      'unused-imports/no-unused-imports': 'warn',

      // Import ordering with alphabetization
      'import/order': [
        'warn',
        {
          groups: [
            'type',
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling'],
            'index',
            'object',
          ],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before',
            },
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },

  // Admin component overrides (Payload CMS admin UI)
  {
    files: ['src/components/admin/**/*.{ts,tsx}', 'src/app/(payload)/**/*.{ts,tsx}'],
    rules: {
      // Allow <img> tags in admin components (Payload CMS UI, not public pages)
      '@next/next/no-img-element': 'off',
    },
  },

  // Logger and migration overrides. This rule matches no files today: the
  // logger is now a folder, and migrations live under `src/migrations/`.
  // Update the globs below, or remove this block.
  {
    files: ['src/lib/logger.ts', 'migration/**/*.ts'],
    rules: {
      // Allow console calls in the logger and migration scripts.
      'no-console': 'off',
    },
  },

  // Seeds: turn off rules for external data scripts. They run only in
  // development, never in production.
  {
    files: ['seeds/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Tests: allow console calls and `any`. These support debugging and never
  // run in production.
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // React hooks: turn off two rules. Older code uses patterns that Next.js
  // 16's stricter rules now flag as noise.
  {
    plugins: {
      'react-hooks': (await import('eslint-plugin-react-hooks')).default,
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },

  // Global ignores
  {
    ignores: [
      '.next/',
      '.wrangler/',
      '.open-next/',
      '.claude/',
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'src/migrations/',
      'scripts/',
      // Auto-generated files
      'src/payload-types.ts',
      'src/payload-generated-schema.ts',
      'src/app/(payload)/admin/importMap.js',
      'src/app/(payload)/api/graphql-playground/route.ts',
      'src/app/(payload)/layout.tsx',
      'src/app/(payload)/admin/\\[\\[...segments\\]\\]/not-found.tsx',
      'src/app/(payload)/admin/\\[\\[...segments\\]\\]/page.tsx',
      'src/app/(payload)/api/\\[...slug\\]/route.ts',
      'src/app/(payload)/api/graphql/route.ts',
      'worker-configuration.d.ts',
    ],
  },
]

export default eslintConfig

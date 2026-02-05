import { dirname } from 'path'
import { fileURLToPath } from 'url'

import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  // Extend Next.js recommended configs
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // Global rules
  {
    plugins: {
      'unused-imports': (await import('eslint-plugin-unused-imports')).default,
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

  // Logger-specific overrides
  {
    files: ['src/lib/logger.ts', 'migration/**/*.ts'],
    rules: {
      // Allow console in logger and migration scripts
      'no-console': 'off',
    },
  },

  // Global ignores
  {
    ignores: [
      '.next/',
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'src/migrations/',
      // Auto-generated payload files
      'src/payload-types.ts',
      'src/payload-generated-schema.ts',
      'src/app/(payload)/admin/importMap.js',
      'src/app/(payload)/api/graphql-playground/route.ts',
      'src/app/(payload)/layout.tsx',
      'src/app/(payload)/admin/\\[\\[...segments\\]\\]/not-found.tsx',
      'src/app/(payload)/admin/\\[\\[...segments\\]\\]/page.tsx',
      'src/app/(payload)/api/\\[...slug\\]/route.ts',
      'src/app/(payload)/api/graphql/route.ts',
    ],
  },
]

export default eslintConfig

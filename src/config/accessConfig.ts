/**
 * Access Plugin Configuration
 *
 * This is the single source of truth for RBAC and project visibility.
 * Extracted to its own file to avoid circular dependencies between
 * payload.config.ts and lib/access modules.
 */

import type { AccessPluginOptions } from '@/lib/access'

export const accessPluginConfig: AccessPluginOptions = {
  projects: {
    'wemeditate-web': {
      collections: [
        'pages',
        'meditations',
        'music',
        'albums',
        'forms',
        'form-submissions',
        'authors',
        'page-tags',
        'meditation-tags',
        'music-tags',
        'narrators',
        'frames',
      ],
      globals: ['we-meditate-web-settings'],
    },
    'wemeditate-app': {
      collections: [
        'meditations',
        'music',
        'albums',
        'lessons',
        'lectures',
        'frames',
        'narrators',
        'meditation-tags',
        'music-tags',
      ],
      globals: ['we-meditate-app-settings'],
    },
    'sahaj-atlas': {
      collections: [],
      globals: ['sahaj-atlas-settings'],
    },
  },
  roles: {
    managers: {
      'meditations-editor': {
        label: 'Meditations Editor',
        description: 'Can create and edit meditations, upload related media and files',
        project: 'wemeditate-app',
        permissions: {
          meditations: ['create', 'update'],
          narrators: ['create', 'update'],
          images: ['create'],
          files: ['create'],
        },
      },
      'path-editor': {
        label: 'Path Editor',
        description: 'Can edit lessons and lectures, upload related media and files',
        project: 'wemeditate-app',
        permissions: {
          lessons: ['update'],
          lectures: ['update'],
          images: ['create'],
          files: ['create'],
        },
      },
      translator: {
        label: 'Translator',
        description: 'Can edit localized fields in pages, music, and albums',
        project: 'wemeditate-web',
        permissions: {
          pages: ['translate'],
          music: ['translate'],
          albums: ['translate'],
        },
      },
    },
    clients: {
      'wemeditate-web': {
        label: 'We Meditate Web',
        description: 'Access for We Meditate web frontend application',
        project: 'wemeditate-web',
        permissions: {
          'we-meditate-web-settings': ['read'],
          meditations: ['read'],
          frames: ['read'],
          narrators: ['read'],
          images: ['read'],
          files: ['read'],
          pages: ['read'],
          music: ['read'],
          albums: ['read'],
          forms: ['read'],
          authors: ['read'],
          'meditation-tags': ['read'],
          'page-tags': ['read'],
          'music-tags': ['read'],
          'form-submissions': ['create'],
        },
      },
      'wemeditate-app': {
        label: 'We Meditate App',
        description: 'Access for We Meditate mobile application',
        project: 'wemeditate-app',
        permissions: {
          'we-meditate-app-settings': ['read'],
          meditations: ['read'],
          frames: ['read'],
          narrators: ['read'],
          lessons: ['read'],
          lectures: ['read'],
          music: ['read'],
          albums: ['read'],
          images: ['read'],
          files: ['read'],
          'meditation-tags': ['read'],
          'page-tags': ['read'],
          'music-tags': ['read'],
        },
      },
      'sahaj-atlas': {
        label: 'Sahaj Atlas',
        description: 'Access for Sahaj Atlas application',
        project: 'sahaj-atlas',
        permissions: {
          'sahaj-atlas-settings': ['read'],
          images: ['read'],
          files: ['read'],
        },
      },
    },
  },
  bypass: {
    managers: ({ user, collection, operation, docId }) => {
      // 1. Inactive manager blocking
      if (user.type === 'inactive') return 'deny'

      // 2. Admin bypass (full access)
      if (user.type === 'admin') return 'allow'

      // 3. customResourceAccess: Allow update for specific documents
      if (operation === 'update' && docId && user.customResourceAccess?.length) {
        const hasAccess = user.customResourceAccess.some(
          (access) => access.relationTo === collection && String(access.value) === String(docId),
        )
        if (hasAccess) return 'allow'
      }
      return 'continue'
    },
    clients: ({ user }) => {
      // 1. Inactive client blocking
      if (!user.active) return 'deny'

      return 'continue'
    },
  },
}

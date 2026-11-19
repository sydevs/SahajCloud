import { Block } from 'payload'

export const ClassDirectoryBlock: Block = {
  slug: 'class-directory',
  interfaceName: 'ClassDirectoryBlock',
  // Icon: Map pin beside a three-line list (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTYgMi41YTMuNSAzLjUgMCAwIDEgMy41IDMuNWMwIDIuNS0zLjUgNi0zLjUgNlMyLjUgOC41IDIuNSA2QTMuNSAzLjUgMCAwIDEgNiAyLjVaIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjYiIHI9IjEuMjUiLz48bGluZSB4MT0iMTIuNSIgeTE9IjUiIHgyPSIxNy41IiB5Mj0iNSIvPjxsaW5lIHgxPSIxMi41IiB5MT0iOSIgeDI9IjE3LjUiIHkyPSI5Ii8+PGxpbmUgeDE9IjEyLjUiIHkxPSIxMyIgeDI9IjE3LjUiIHkyPSIxMyIvPjxsaW5lIHgxPSIzIiB5MT0iMTYuNSIgeDI9IjE3LjUiIHkyPSIxNi41Ii8+PC9zdmc+',
  labels: {
    singular: 'Class Directory',
    plural: 'Class Directories',
  },
  admin: {
    group: 'Layout',
  },
  // No language field: the directory follows the language of the page it sits on
  // (sydevs/WeMeditateWeb#271).
  fields: [
    {
      name: 'opensAt',
      type: 'relationship',
      relationTo: ['regions', 'events'],
      admin: {
        description: 'Where the directory opens. Leave blank for its usual starting point.',
      },
    },
    {
      name: 'showMap',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Draw the map. Turn it off for a plain list of classes.',
      },
    },
    {
      name: 'onlineOnly',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Open filtered to online classes. A visitor can still widen it from the directory’s own filters.',
      },
    },
  ],
}

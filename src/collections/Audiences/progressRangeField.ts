/**
 * Field factory for a min/max numeric range group used by Audience targeting
 * rules. Both bounds are inclusive and optional; `max` validates that it
 * exceeds `min` when both are supplied.
 */
export function progressRangeField(name: string, label: string) {
  return {
    name,
    type: 'group' as const,
    label,
    fields: [
      {
        type: 'row' as const,
        fields: [
          {
            name: 'min',
            type: 'number' as const,
            label: 'Min',
            admin: { width: '300px', description: 'Minimum (inclusive). Empty = no lower bound.' },
          },
          {
            name: 'max',
            type: 'number' as const,
            label: 'Max',
            admin: { width: '300px', description: 'Maximum (inclusive). Empty = no upper bound.' },
            validate: (
              value: number | null | undefined,
              { siblingData }: { siblingData: Record<string, unknown> },
            ) => {
              if (
                value !== null &&
                value !== undefined &&
                siblingData?.min !== null &&
                siblingData?.min !== undefined
              ) {
                if (value <= (siblingData.min as number)) return 'Max must be greater than min'
              }
              return true
            },
          },
        ],
      },
    ],
  }
}

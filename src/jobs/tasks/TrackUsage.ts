import type { CollectionAfterReadHook, TaskConfig } from 'payload'

export const trackClientUsageHook: CollectionAfterReadHook = async ({ doc, req }) => {
  // Only track usage for API clients (not regular users)
  if (req.user?.collection === 'clients' && req.user?.id) {
    await req.payload.jobs.queue({
      task: 'trackClientUsage',
      input: {
        clientId: req.user.id
      },
    })
  }

  return doc
}

export const ResetUsage: TaskConfig<'resetClientUsage'> = {
  retries: 2,
  label: 'Reset Client Usage',
  slug: 'resetClientUsage',
  inputSchema: [],
  outputSchema: [],
  schedule: [
    {
      cron: '0 0 * * *', // Every day at midnight
      queue: 'nightly',
    },
  ],
  handler: async ({ req }) => {
    // Reset database counters
    const clients = await req.payload.find({
      collection: 'clients',
      where: {
        'usageStats.dailyRequests': {
          greater_than: 0,
        },
      },
    })
    
    for (const client of clients.docs) {
      await req.payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          usageStats: {
            ...client.usageStats,
            maxDailyRequests: Math.max(client.usageStats?.maxDailyRequests || 0, client.usageStats?.dailyRequests || 0),
            dailyRequests: 0,
          },
        },
      })
    }

    return { output: null }
  },
}

export const TrackUsage: TaskConfig<'trackClientUsage'> = {
  retries: 3,
  slug: 'trackClientUsage',
  inputSchema: [
    {
      name: 'clientId',
      type: 'text',
      required: true,
    }
  ],
  handler: async ({ input, req }) => {
    const client = await req.payload.findByID({
      collection: 'clients',
      id: input.clientId,
    })
    
    await req.payload.update({
      collection: 'clients',
      id: input.clientId,
      data: {
        usageStats: {
          lastRequestAt: new Date().toISOString(),
          dailyRequests: (client.usageStats?.dailyRequests || 0) + 1,
        },
      },
    })

    return { output: null }
  },
}

import type { AdminAccountQuery } from '../model/adminTypes'

export const adminQueryKeys = {
  all: ['admin'] as const,
  metrics: ['admin', 'metrics'] as const,
  accountLists: ['admin', 'accounts'] as const,
  accounts: (query: AdminAccountQuery) => ['admin', 'accounts', query] as const,
}

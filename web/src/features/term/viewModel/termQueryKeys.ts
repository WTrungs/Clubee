import type { HandoverItemQuery } from '../model/handoverTypes'

export const termQueryKeys = {
  all: ['terms'] as const,
  list: (clubId: string) => ['terms', 'list', clubId] as const,
  handover: (clubId: string, handoverId: string) => ['terms', 'handover', clubId, handoverId] as const,
  handoverItems: (clubId: string, handoverId: string) => ['terms', 'handoverItems', clubId, handoverId] as const,
  handoverItemPage: (clubId: string, handoverId: string, query: HandoverItemQuery) => ['terms', 'handoverItems', clubId, handoverId, query] as const,
}

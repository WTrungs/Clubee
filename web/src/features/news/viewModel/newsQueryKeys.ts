import type { NewsQuery } from '../model/newsTypes'

export const newsQueryKeys = {
  all: (clubId: string) => ['news', clubId] as const,
  list: (clubId: string, query: NewsQuery) => ['news', clubId, 'list', query] as const,
  detail: (clubId: string, newsId: string) => ['news', clubId, 'detail', newsId] as const,
}

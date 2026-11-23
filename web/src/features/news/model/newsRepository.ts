import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { NewsDetail, NewsQuery, NewsRequest, NewsSummary, UpdateNewsRequest } from './newsTypes'

const base = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/news`
const one = (clubId: string, newsId: string) => `${base(clubId)}/${encodeURIComponent(newsId)}`

/** FR-CLB-06: tin tức của CLB. */
export const newsRepository = {
  list: (clubId: string, query: NewsQuery) => httpClient.get<Page<NewsSummary>>(base(clubId), { query: { q: query.q, status: query.status, page: query.page } }),
  get: (clubId: string, newsId: string) => httpClient.get<NewsDetail>(one(clubId, newsId)),
  create: (clubId: string, request: NewsRequest) => httpClient.post<NewsDetail>(base(clubId), request),
  update: (clubId: string, newsId: string, request: UpdateNewsRequest) => httpClient.patch<NewsDetail>(one(clubId, newsId), request),
  uploadImage: (clubId: string, newsId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return httpClient.post<NewsDetail>(`${one(clubId, newsId)}/image`, form)
  },
  publish: (clubId: string, newsId: string, version: number) => httpClient.post<NewsDetail>(`${one(clubId, newsId)}/publication`, { version }),
  hide: (clubId: string, newsId: string, version: number) => httpClient.post<NewsDetail>(`${one(clubId, newsId)}/hiding`, { version }),
}

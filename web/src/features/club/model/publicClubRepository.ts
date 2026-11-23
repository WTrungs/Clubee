import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { PublicNewsDetail, PublicNewsSummary } from '@/features/news/model/newsTypes'
import type { PublicClubCard, PublicClubProfile, PublicClubQuery } from './clubTypes'

/** FR-CLB-05: danh bạ công khai, gọi được khi chưa đăng nhập. */
export const publicClubRepository = {
  list: (query: PublicClubQuery) =>
    httpClient.get<Page<PublicClubCard>>('/public/clubs', { query: { q: query.q, field: query.field, page: query.page, size: query.size } }),
  fields: () => httpClient.get<string[]>('/public/club-fields'),
  get: (clubId: string) => httpClient.get<PublicClubProfile>(`/public/clubs/${encodeURIComponent(clubId)}`),
  /** FR-CLB-07: tin đã xuất bản. */
  news: (clubId: string, page = 0) => httpClient.get<Page<PublicNewsSummary>>(`/public/clubs/${encodeURIComponent(clubId)}/news`, { query: { page } }),
  newsDetail: (clubId: string, newsId: string) => httpClient.get<PublicNewsDetail>(`/public/clubs/${encodeURIComponent(clubId)}/news/${encodeURIComponent(newsId)}`),
}

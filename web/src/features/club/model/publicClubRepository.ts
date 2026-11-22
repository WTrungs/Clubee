import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { PublicClubCard, PublicClubProfile, PublicClubQuery } from './clubTypes'

/** FR-CLB-05: danh bạ công khai, gọi được khi chưa đăng nhập. */
export const publicClubRepository = {
  list: (query: PublicClubQuery) =>
    httpClient.get<Page<PublicClubCard>>('/public/clubs', { query: { q: query.q, field: query.field, page: query.page, size: query.size } }),
  fields: () => httpClient.get<string[]>('/public/club-fields'),
  get: (clubId: string) => httpClient.get<PublicClubProfile>(`/public/clubs/${encodeURIComponent(clubId)}`),
}

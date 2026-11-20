import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { ClubDetail, ClubDirectoryEntry, ClubDirectoryQuery, ClubSettings, CreateClubRequest, UpdateClubRequest, UpdateClubSettingsRequest } from './clubTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`

export const clubRepository = {
  getClub: (clubId: string) => httpClient.get<ClubDetail>(club(clubId)),
  /** Danh bạ CLB để gửi yêu cầu gia nhập (FR-MEM-02); chỉ thông tin công khai. */
  directory: (query: ClubDirectoryQuery) => httpClient.get<Page<ClubDirectoryEntry>>('/clubs', { query: { q: query.q, page: query.page, size: query.size } }),
  /** FR-CLB-01. */
  create: (request: CreateClubRequest) => httpClient.post<ClubDetail>('/clubs', request),
  /** FR-CLB-02. */
  update: (clubId: string, request: UpdateClubRequest) => httpClient.patch<ClubDetail>(club(clubId), request),
  uploadLogo: (clubId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return httpClient.post<ClubDetail>(`${club(clubId)}/logo`, form)
  },
  /** FR-CLB-03. */
  settings: (clubId: string) => httpClient.get<ClubSettings>(`${club(clubId)}/settings`),
  updateSettings: (clubId: string, request: UpdateClubSettingsRequest) => httpClient.patch<ClubSettings>(`${club(clubId)}/settings`, request),
}

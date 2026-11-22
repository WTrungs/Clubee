import type { PersonRef } from '@/api/commonTypes'
import { httpClient } from '@/api/httpClient'
import type { AuditLogPage, AuditLogQuery } from './auditLogTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`

/** FR-RPT-06: chỉ đọc, không có thao tác sửa hay xóa nhật ký. */
export const auditLogRepository = {
  list: (clubId: string, query: AuditLogQuery) =>
    httpClient.get<AuditLogPage>(`${club(clubId)}/audit-logs`, {
      query: { actorId: query.actorId, objectType: query.objectType, objectId: query.objectId, from: query.from, to: query.to, page: query.page, size: query.size },
    }),
  actors: (clubId: string, q = '') => httpClient.get<PersonRef[]>(`${club(clubId)}/audit-log-actors`, { query: { q } }),
}

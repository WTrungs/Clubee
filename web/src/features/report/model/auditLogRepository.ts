import type { PersonRef } from '@/api/commonTypes'
import { httpClient } from '@/api/httpClient'
import type { ExportFormat } from '@/shared/lib/exportFormat'
import type { AuditLogPage, AuditLogQuery } from './auditLogTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`

/** FR-RPT-06: chỉ đọc, không có thao tác sửa hay xóa nhật ký. */
export const auditLogRepository = {
  list: (clubId: string, query: AuditLogQuery) =>
    httpClient.get<AuditLogPage>(`${club(clubId)}/audit-logs`, {
      query: { actorId: query.actorId, objectType: query.objectType, objectId: query.objectId, from: query.from, to: query.to, page: query.page, size: query.size },
    }),
  /** FR-RPT-07: xuất theo bộ lọc đang chọn, không phân trang; máy chủ ghi nhật ký. */
  export: (clubId: string, query: AuditLogQuery, format: ExportFormat) =>
    httpClient.download(`${club(clubId)}/audit-logs/export`, {
      query: { actorId: query.actorId, objectType: query.objectType, objectId: query.objectId, from: query.from, to: query.to, format },
    }),
  actors: (clubId: string, q = '') => httpClient.get<PersonRef[]>(`${club(clubId)}/audit-log-actors`, { query: { q } }),
}

import { db } from './db'
import { newId } from './mockHttp'
import { nowIso } from './mockTime'

/** Một dòng nhật ký thao tác (NFR-SEC-05): chỉ ghi thêm, không sửa, không xóa; màn xem nhật ký là FR-RPT-06. */
export interface DbAuditLog {
  id: string
  at: string
  actorId: string
  /** Để trống (`null`) với thao tác cấp hệ thống, ví dụ Admin khóa tài khoản. */
  clubId: string | null
  action: string
  objectType: 'ACCOUNT' | 'CLUB' | 'POSITION' | 'PERMISSION' | 'TRANSFER_REQUEST'
  objectId: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
}

export function audit(entry: Omit<DbAuditLog, 'id' | 'at'>): DbAuditLog {
  const log: DbAuditLog = { id: newId('log'), at: nowIso(), ...entry }
  db.auditLogs.push(log)
  return log
}

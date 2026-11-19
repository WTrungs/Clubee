import { userNameOf } from './auditLabels'
import { db } from './db'
import { newId } from './mockHttp'
import { nowIso } from './mockTime'

/** Loại đối tượng của nhật ký; các thao tác bắt buộc ghi theo BR-DATA-03. */
export type AuditObjectType =
  | 'ACCOUNT'
  | 'CLUB'
  | 'POSITION'
  | 'PERMISSION'
  | 'TRANSFER_REQUEST'
  | 'MEMBERSHIP'
  | 'TRANSACTION'
  | 'ATTENDANCE'
  | 'TERM'
  | 'HANDOVER_ITEM'

/** Một dòng nhật ký thao tác (NFR-SEC-05): chỉ ghi thêm, không sửa, không xóa; màn xem nhật ký là FR-RPT-06. */
export interface DbAuditLog {
  id: string
  at: string
  actorId: string
  /** Họ tên người làm lúc ghi (BR-DATA-02); đổi tên sau đó không đổi nhật ký. */
  actorName: string
  /** Để trống (`null`) với thao tác cấp hệ thống, ví dụ Admin khóa tài khoản. */
  clubId: string | null
  action: string
  objectType: AuditObjectType
  objectId: string
  /** Mô tả đối tượng lúc ghi, ví dụ "Thủ quỹ: Võ Ngọc Mai" hoặc "Khoản chi 400.000 đ ở Quỹ chung: Mua dây đàn". */
  objectLabel: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  reason: string | null
}

/** Dữ liệu ghi một dòng; `at` chỉ truyền khi phải trùng mốc với bản ghi nghiệp vụ (ví dụ lịch sử tư cách). */
export type AuditEntry = Omit<DbAuditLog, 'id' | 'at' | 'actorName'> & { at?: string }

export function audit({ at = nowIso(), ...entry }: AuditEntry): DbAuditLog {
  const log: DbAuditLog = { id: newId('log'), at, actorName: userNameOf(db, entry.actorId), ...entry }
  db.auditLogs.push(log)
  return log
}

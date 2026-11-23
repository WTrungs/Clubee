import { PERMISSION_CATALOG } from '@/features/org/model/permissionCatalog'
import { PERMISSION_KEYS, type PermissionChange, type PermissionKey, type PermissionMatrix, type PermissionMatrixCell, type PermissionMatrixChangeLog } from '@/features/org/model/permissionTypes'
import { db, type PositionRole } from './db'
import { can, defaultCell, MATRIX_ROLES, roleAllows } from './mockAccess'
import { audit } from './mockAudit'
import { personRef } from './mockMembers'
import { notify, structureTarget } from './mockNotifications'
import { isPositionEffective, positionsIn, positionTitles } from './mockPermissions'
import { nowIso } from './mockTime'

/** Số phiên bản và lần sửa gần nhất của bảng phân quyền mỗi CLB; chưa sửa lần nào thì không có bản ghi, coi là phiên bản 1. */
export interface DbPermissionMatrixMeta {
  clubId: string
  version: number
  updatedAt: string
  updatedBy: string
}

const LOCK_REASONS: Partial<Record<`${PositionRole}:${PermissionKey}`, string>> = {
  'PRESIDENT:ASSIGN_POSITIONS': 'Chủ nhiệm luôn giữ quyền này để CLB không mất người gán chức vụ.',
  'PRESIDENT:EDIT_PERMISSIONS': 'Chủ nhiệm luôn giữ quyền này để CLB không mất người chỉnh bảng phân quyền.',
  'EVENT_LEAD:APPROVE_EXPENSE': 'Trưởng BTC không tự duyệt chi của sự kiện mình phụ trách.',
}
const NOT_APPLICABLE_REASON = 'Không áp dụng với phạm vi của chức vụ này.'
const OWN_ROLE_REASON = 'Bạn đang giữ chức vụ này nên không tự sửa quyền của nó.'

export const metaOf = (clubId: string) => db.permissionMatrixMeta.find((meta) => meta.clubId === clubId)
export const matrixVersionOf = (clubId: string) => metaOf(clubId)?.version ?? 1

/** Chức vụ người xem đang giữ ở CLB; hàng của các chức vụ này không tự sửa được (BR-ACL-03). */
export const ownRolesOf = (userId: string, clubId: string) => new Set(positionsIn(userId, clubId).map((position) => position.role))

export function cellOf(clubId: string, viewerId: string, role: PositionRole, permission: PermissionKey): PermissionMatrixCell {
  const base = defaultCell(role, permission)
  if (!base) return { role, permission, enabled: false, defaultEnabled: false, state: 'NOT_APPLICABLE', lockReason: NOT_APPLICABLE_REASON }
  if (base.locked) return { role, permission, enabled: base.enabled, defaultEnabled: base.enabled, state: 'LOCKED', lockReason: LOCK_REASONS[`${role}:${permission}`] ?? null }
  const enabled = roleAllows(clubId, role, permission)
  const own = ownRolesOf(viewerId, clubId).has(role)
  return { role, permission, enabled, defaultEnabled: base.enabled, state: own ? 'OWN_ROLE' : 'EDITABLE', lockReason: own ? OWN_ROLE_REASON : null }
}

export function matrixOf(clubId: string, viewerId: string): PermissionMatrix {
  const cells = PERMISSION_KEYS.flatMap((permission) => MATRIX_ROLES.map((role) => cellOf(clubId, viewerId, role, permission)))
  const meta = metaOf(clubId)
  const editable = can(viewerId, clubId, 'EDIT_PERMISSIONS')
  return {
    roles: MATRIX_ROLES,
    permissions: [...PERMISSION_KEYS],
    cells,
    changedFromDefault: cells.filter((cell) => cell.state !== 'NOT_APPLICABLE' && cell.enabled !== cell.defaultEnabled).length,
    updatedAt: meta?.updatedAt ?? null,
    updatedBy: meta ? personRef(meta.updatedBy) : null,
    allowedActions: editable ? ['EDIT', 'RESET'] : [],
    version: matrixVersionOf(clubId),
  }
}

/** Ghi một ô; trở về mặc định thì bỏ bản ghi khác mặc định. Trả true nếu ô thật sự đổi. */
function writeCell(clubId: string, actorId: string, change: PermissionChange, reset: boolean): boolean {
  const before = roleAllows(clubId, change.role, change.permission)
  if (before === change.enabled) return false
  db.permissionOverrides = db.permissionOverrides.filter((override) => !(override.clubId === clubId && override.role === change.role && override.permission === change.permission))
  if (change.enabled !== defaultCell(change.role, change.permission)?.enabled) {
    db.permissionOverrides.push({ clubId, role: change.role, permission: change.permission, enabled: change.enabled, updatedBy: actorId, updatedAt: nowIso() })
  }
  audit({
    actorId,
    clubId,
    action: reset ? 'RESET_PERMISSION' : 'CHANGE_PERMISSION',
    objectType: 'PERMISSION',
    objectId: `${change.role}:${change.permission}`,
    objectLabel: `${positionTitles[change.role]}: ${PERMISSION_CATALOG[change.permission].label}`,
    before: { enabled: before },
    after: { enabled: change.enabled },
    reason: null,
  })
  return true
}

/** R-02: người đang giữ chức vụ bị đổi quyền nhận một thông báo gộp theo chức vụ. */
function notifyHolders(clubId: string, actorId: string, changes: PermissionChange[]) {
  const clubName = db.clubs.find((club) => club.id === clubId)?.name ?? 'CLB'
  const label = (permission: PermissionKey) => PERMISSION_CATALOG[permission].label
  for (const role of new Set(changes.map((change) => change.role))) {
    const roleChanges = changes.filter((change) => change.role === role)
    const holders = db.positions.filter((position) => position.clubId === clubId && position.role === role && isPositionEffective(position)).map((position) => position.userId)
    const turnedOn = roleChanges.filter((change) => change.enabled).map((change) => label(change.permission))
    const turnedOff = roleChanges.filter((change) => !change.enabled).map((change) => label(change.permission))
    const body = [...(turnedOn.length ? [`Được thêm: ${turnedOn.join(', ')}.`] : []), ...(turnedOff.length ? [`Bị bỏ: ${turnedOff.join(', ')}.`] : [])].join(' ')
    notify(holders, { clubId, category: 'POSITION', title: `Quyền của ${positionTitles[role]} ở ${clubName} vừa thay đổi`, body, target: structureTarget(clubId), actorId })
  }
}

function bumpVersion(clubId: string, actorId: string) {
  const meta = metaOf(clubId)
  const now = nowIso()
  if (meta) Object.assign(meta, { version: meta.version + 1, updatedAt: now, updatedBy: actorId })
  else db.permissionMatrixMeta.push({ clubId, version: 2, updatedAt: now, updatedBy: actorId })
}

/** Áp các ô đã kiểm hợp lệ; tất cả hoặc không gì do bên gọi kiểm trước. Trả các ô thật sự đổi. */
export function applyMatrixChanges(clubId: string, actorId: string, changes: PermissionChange[], reset = false): PermissionChange[] {
  const applied = changes.filter((change) => writeCell(clubId, actorId, change, reset))
  if (applied.length > 0) {
    bumpVersion(clubId, actorId)
    notifyHolders(clubId, actorId, applied)
  }
  return applied
}

/** Các ô người gọi đưa về mặc định được: bỏ ô khóa, ô vô nghĩa và hàng chức vụ người gọi đang giữ. */
export function resettableChanges(clubId: string, actorId: string): PermissionChange[] {
  const own = ownRolesOf(actorId, clubId)
  return db.permissionOverrides
    .filter((override) => override.clubId === clubId && !own.has(override.role))
    .flatMap((override) => {
      const base = defaultCell(override.role, override.permission)
      return base && !base.locked ? [{ role: override.role, permission: override.permission, enabled: base.enabled }] : []
    })
}

export function matrixChangeLogs(clubId: string): PermissionMatrixChangeLog[] {
  // Nhật ký chỉ ghi thêm theo thời gian, nên đảo thứ tự là mới nhất trước kể cả khi nhiều dòng cùng mốc giờ.
  return db.auditLogs
    .filter((log) => log.clubId === clubId && log.objectType === 'PERMISSION')
    .toReversed()
    .map((log) => {
      const [role = '', permission = ''] = log.objectId.split(':')
      return {
        id: log.id,
        at: log.at,
        actor: personRef(log.actorId),
        role: role as PositionRole,
        permission: permission as PermissionKey,
        before: log.before?.enabled === true,
        after: log.after?.enabled === true,
        reset: log.action === 'RESET_PERMISSION',
      }
    })
}

import { PERMISSION_CATALOG, PERMISSION_GROUP_LABELS, type PermissionGroup } from '../model/permissionCatalog'
import type { PositionRole } from '../model/orgTypes'
import type { PermissionChange, PermissionKey, PermissionMatrix, PermissionMatrixCell } from '../model/permissionTypes'
import { positionRoleLabel } from './orgDisplay'

/** Thay đổi chưa lưu: khóa là `role:permission`, giá trị là trạng thái mới. */
export type PendingChanges = Readonly<Record<string, boolean>>

export const cellKey = (role: PositionRole, permission: PermissionKey) => `${role}:${permission}`

export const permissionLabel = (permission: PermissionKey) => PERMISSION_CATALOG[permission].label

/** Tên truy cập của công tắc, ví dụ "Duyệt chi cho Thủ quỹ". */
export const switchLabel = (cell: Pick<PermissionMatrixCell, 'role' | 'permission'>) => `${permissionLabel(cell.permission)} cho ${positionRoleLabel[cell.role]}`

/** Các quyền theo nhóm, giữ thứ tự máy chủ trả. */
export function groupPermissions(permissions: PermissionKey[]): Array<{ group: PermissionGroup; label: string; permissions: PermissionKey[] }> {
  const groups = [...new Set(permissions.map((permission) => PERMISSION_CATALOG[permission].group))]
  return groups.map((group) => ({ group, label: PERMISSION_GROUP_LABELS[group], permissions: permissions.filter((permission) => PERMISSION_CATALOG[permission].group === group) }))
}

/** Trạng thái hiện ra của ô: theo thay đổi chưa lưu nếu có, không thì theo máy chủ. */
export const shownEnabled = (cell: PermissionMatrixCell, pending: PendingChanges) => pending[cellKey(cell.role, cell.permission)] ?? cell.enabled

/** Bật về đúng trạng thái đang lưu thì bỏ khỏi danh sách chưa lưu. */
export function togglePending(pending: PendingChanges, cell: PermissionMatrixCell, enabled: boolean): PendingChanges {
  const key = cellKey(cell.role, cell.permission)
  const { [key]: _removed, ...rest } = pending
  return enabled === cell.enabled ? rest : { ...rest, [key]: enabled }
}

export function pendingChangeList(matrix: PermissionMatrix | null, pending: PendingChanges): PermissionChange[] {
  if (!matrix) return []
  return matrix.cells.flatMap((cell) => {
    const next = pending[cellKey(cell.role, cell.permission)]
    return next === undefined ? [] : [{ role: cell.role, permission: cell.permission, enabled: next }]
  })
}

export const describeChange = (change: PermissionChange) => `${positionRoleLabel[change.role]}: ${change.enabled ? 'bật' : 'tắt'} ${permissionLabel(change.permission)}`

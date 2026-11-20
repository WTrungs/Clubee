import { http, HttpResponse } from 'msw'
import { PERMISSION_KEYS, type PermissionChange, type PermissionKey, type UpdatePermissionMatrixRequest } from '@/features/org/model/permissionTypes'
import type { PositionRole } from '../db'
import { can, forbidden, MATRIX_ROLES } from '../mockAccess'
import { API, currentUser, networkDelay, paginate, problem, writer } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import { applyMatrixChanges, cellOf, matrixChangeLogs, matrixOf, matrixVersionOf, ownRolesOf, resettableChanges } from '../mockPermissionMatrix'
import { isBoardMember, positionTitles } from '../mockPermissions'

/** Mỗi lần lưu tối đa toàn bộ ô của ma trận. */
const CHANGES_MAX = PERMISSION_KEYS.length * MATRIX_ROLES.length

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const boardOnly = () => problem(403, 'Chỉ ban chủ nhiệm xem được ma trận quyền.', 'FORBIDDEN')

const isChange = (value: unknown): value is PermissionChange => {
  if (typeof value !== 'object' || value === null) return false
  const change = value as Record<string, unknown>
  return MATRIX_ROLES.includes(change.role as PositionRole) && PERMISSION_KEYS.includes(change.permission as PermissionKey) && typeof change.enabled === 'boolean'
}

/** FR-ORG-05: xem, sửa theo lô, khôi phục mặc định và lịch sử thay đổi của ma trận quyền. */
export const permissionHandlers = [
  http.get(`${API}/clubs/:clubId/permission-matrix`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return boardOnly()
    return HttpResponse.json(matrixOf(clubId, user.value.id))
  }),

  http.put(`${API}/clubs/:clubId/permission-matrix`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'EDIT_PERMISSIONS')) return forbidden(clubId, 'EDIT_PERMISSIONS', 'chỉnh ma trận quyền')
    const body = (await request.json()) as Partial<UpdatePermissionMatrixRequest>
    const raw: unknown[] = Array.isArray(body.changes) ? body.changes : []
    if (raw.length === 0) return problem(400, 'Chưa có thay đổi nào để lưu.', 'VALIDATION', [{ field: 'changes', message: `Gửi từ 1 đến ${CHANGES_MAX} ô.` }])
    if (raw.length > CHANGES_MAX) {
      return problem(400, `Mỗi lần lưu tối đa ${CHANGES_MAX} ô.`, 'VALIDATION', [{ field: 'changes', message: `Gửi từ 1 đến ${CHANGES_MAX} ô.` }])
    }
    const invalid = raw.flatMap((change, index) => (isChange(change) ? [] : [{ field: `changes[${index}]`, message: 'Ô không hợp lệ.' }]))
    if (invalid.length > 0) return problem(400, 'Có ô không hợp lệ.', 'VALIDATION', invalid)
    const changes = raw.filter(isChange)
    if (new Set(changes.map((change) => `${change.role}:${change.permission}`)).size !== changes.length) {
      return problem(400, 'Mỗi ô chỉ được đổi một lần trong một lần lưu.', 'VALIDATION', [{ field: 'changes', message: 'Có ô bị lặp.' }])
    }
    // BR-ACL-03: không tự sửa quyền của chức vụ mình đang giữ, kể cả qua chức vụ thứ hai.
    const own = ownRolesOf(user.value.id, clubId)
    const ownRoles = [...new Set(changes.filter((change) => own.has(change.role)).map((change) => change.role))]
    if (ownRoles.length > 0) {
      return problem(403, `Không tự sửa quyền của chức vụ bạn đang giữ (${ownRoles.map((role) => positionTitles[role]).join(', ')}).`, 'OWN_ROLE')
    }
    if (body.version !== matrixVersionOf(clubId)) return problem(409, 'Ma trận quyền vừa được người khác sửa. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
    const locked = changes.flatMap((change, index) => {
      const cell = cellOf(clubId, user.value.id, change.role, change.permission)
      return cell.state === 'LOCKED' || cell.state === 'NOT_APPLICABLE' ? [{ field: `changes[${index}]`, message: cell.lockReason ?? 'Ô này không sửa được.' }] : []
    })
    if (locked.length > 0) return problem(422, 'Có ô bị khóa hoặc không áp dụng nên chưa lưu thay đổi nào.', 'PERMISSION_LOCKED', locked)
    applyMatrixChanges(clubId, user.value.id, changes)
    return HttpResponse.json(matrixOf(clubId, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/permission-matrix/reset`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'EDIT_PERMISSIONS')) return forbidden(clubId, 'EDIT_PERMISSIONS', 'chỉnh ma trận quyền')
    const body = (await request.json()) as { version?: unknown }
    if (body.version !== matrixVersionOf(clubId)) return problem(409, 'Ma trận quyền vừa được người khác sửa. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
    // Hàng của chức vụ người gọi đang giữ không đổi; ô còn lệch nằm ở `changedFromDefault`.
    applyMatrixChanges(clubId, user.value.id, resettableChanges(clubId, user.value.id), true)
    return HttpResponse.json(matrixOf(clubId, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/permission-matrix/changes`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return boardOnly()
    return HttpResponse.json(paginate(matrixChangeLogs(clubId), new URL(request.url), 20))
  }),
]

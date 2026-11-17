import { http, HttpResponse } from 'msw'
import { formatDate } from '@/shared/format/formatDate'
import type {
  CloseDepartmentRequest,
  CreatePositionRequest,
  Department,
  DepartmentRequest,
  Position,
  PositionCandidate,
  PositionScope,
  PositionScopeType,
  PositionStatus,
  RevokePositionRequest,
  StandingRole,
  UpdateDepartmentRequest,
} from '@/features/org/model/orgTypes'
import { db, type DbDepartment, type DbPosition, type DbTerm, type PositionRole } from '../db'
import { can, forbidden } from '../mockAccess'
import { API, currentUser, matchesKeyword, newId, networkDelay, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, departmentMemberCount, eligibleMembers, personRef } from '../mockMembers'
import {
  BOARD_ROLES,
  currentTermOf,
  DEPARTMENT_ROLES,
  effectiveEndOf,
  endPositions,
  NO_END,
  grantPosition,
  isBoardMember,
  isPositionListed,
  isPositionOpen,
  isPresidency,
  positionTitleOf,
  positionTitles,
  PRESIDENCY_ROLES,
  presidentsCoverTerm,
  STANDING_ROLES,
} from '../mockPermissions'
import { notify, structureTarget } from '../mockNotifications'
import { isTaskActive, isTaskOverdue } from '../mockScopes'
import { isDueSoon } from '../mockTaskJobs'
import { canAssignStanding, isTermOverdue, lastPresidentHint, openHandoverOf } from '../mockTerms'
import { nowIso, shiftDate, vnToday } from '../mockTime'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const NAME_MIN = 2
const NAME_MAX = 80
const DESCRIPTION_MAX = 500

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const presidencyOnly = () => problem(403, 'Chỉ Chủ nhiệm, Phó chủ nhiệm được gán chức Chủ nhiệm, Phó chủ nhiệm.', 'FORBIDDEN')
const isStanding = (role: unknown): role is StandingRole => STANDING_ROLES.includes(role as StandingRole)

/** Tên ban lấy theo lúc nhiệm kỳ đóng (`departmentNames`), không có thì theo tên hiện tại (BR-DATA-02). */
function scopeOf(position: DbPosition, departmentNames?: ReadonlyMap<string, string>): PositionScope {
  if (BOARD_ROLES.includes(position.role)) return { type: 'CLUB', id: position.scopeId, name: db.clubs.find((club) => club.id === position.scopeId)?.name ?? 'CLB' }
  if (DEPARTMENT_ROLES.includes(position.role)) {
    const department = db.departments.find((candidate) => candidate.id === position.scopeId)
    return { type: 'DEPARTMENT', id: position.scopeId, name: departmentNames?.get(position.scopeId) ?? department?.name ?? 'Ban không còn tồn tại' }
  }
  if (position.role === 'EVENT_LEAD') return { type: 'EVENT', id: position.scopeId, name: db.events.find((event) => event.id === position.scopeId)?.name ?? 'Sự kiện' }
  const subcommittee = db.subcommittees.find((candidate) => candidate.id === position.scopeId)
  return { type: 'SUBCOMMITTEE', id: position.scopeId, name: subcommittee?.name ?? 'Tiểu ban' }
}

function positionStatus(position: DbPosition): PositionStatus {
  if (!isPositionOpen(position)) return 'ENDED'
  return position.startOn > vnToday() ? 'UPCOMING' : 'ACTIVE'
}

/** Chức vụ sự kiện do module Sự kiện quản lý nên màn Cơ cấu chỉ thu hồi chức vụ thường trực; lý do thu hồi chỉ ban chủ nhiệm xem (SRS 3.5). */
function toPosition(position: DbPosition, viewerId: string, departmentNames?: ReadonlyMap<string, string>): Position {
  const revocable = can(viewerId, position.clubId, 'ASSIGN_POSITIONS') && STANDING_ROLES.includes(position.role) && isPositionOpen(position)
  return {
    id: position.id,
    role: position.role,
    scope: scopeOf(position, departmentNames),
    holder: personRef(position.userId),
    startOn: position.startOn,
    endOn: position.endOn,
    status: positionStatus(position),
    untilHandover: position.endOn !== null && effectiveEndOf(position) === null,
    revokedOn: position.revokedAt?.slice(0, 10) ?? null,
    revokeReason: isBoardMember(viewerId, position.clubId) ? position.revokeReason : null,
    assignedBy: position.assignedBy ? personRef(position.assignedBy) : null,
    allowedActions: revocable ? ['REVOKE'] : [],
    version: position.version,
  }
}

const ROLE_ORDER: PositionRole[] = [...STANDING_ROLES, 'EVENT_LEAD', 'SUBCOMMITTEE_LEAD']
const roleOrder = (position: DbPosition) => ROLE_ORDER.indexOf(position.role)
const SCOPE_TYPES: PositionScopeType[] = ['CLUB', 'DEPARTMENT', 'EVENT', 'SUBCOMMITTEE']

/** Chức vụ thường trực từng có hiệu lực trong khoảng nhiệm kỳ; bỏ chức vụ bị hủy trước khi bắt đầu. */
function heldDuring(position: DbPosition, term: DbTerm): boolean {
  if (position.clubId !== term.clubId || !STANDING_ROLES.includes(position.role)) return false
  const end = position.endOn ?? NO_END
  return end >= position.startOn && position.startOn <= term.endOn && end >= term.startOn
}

/** Số việc đang mở của ban; quá hạn và sắp đến hạn tính như ở trang Công việc (BR-TASK-03, FR-TASK-06). */
function taskCounts(departmentId: string) {
  const open = db.tasks.filter((task) => task.scopeType === 'DEPARTMENT' && task.scopeId === departmentId && isTaskActive(task))
  return { openTaskCount: open.length, overdueTaskCount: open.filter(isTaskOverdue).length, dueSoonTaskCount: open.filter((task) => isDueSoon(task)).length }
}

function toDepartment(department: DbDepartment, viewerId: string): Department {
  const leads = db.positions
    .filter((position) => position.scopeId === department.id && DEPARTMENT_ROLES.includes(position.role) && isPositionListed(position))
    .toSorted((a, b) => roleOrder(a) - roleOrder(b))
  const active = department.status === 'ACTIVE'
  const manage = active && can(viewerId, department.clubId, 'MANAGE_DEPARTMENTS')
  const assign = active && can(viewerId, department.clubId, 'ASSIGN_POSITIONS') && canAssignStanding(department.clubId)
  const memberCount = departmentMemberCount(department.id)
  const transfer = active && memberCount > 0 && can(viewerId, department.clubId, 'MANAGE_MEMBERS')
  return {
    id: department.id,
    name: department.name,
    description: department.description,
    status: department.status,
    closedOn: department.closedOn,
    closeReason: department.closeReason,
    leads: leads.map((position) => toPosition(position, viewerId)),
    memberCount,
    ...taskCounts(department.id),
    allowedActions: [
      ...(manage ? (['EDIT', 'CLOSE'] as const) : []),
      ...(assign ? (['ASSIGN_POSITION'] as const) : []),
      ...(transfer ? (['TRANSFER_MEMBERS'] as const) : []),
    ],
    version: department.version,
  }
}

function departmentErrors(clubId: string, body: Partial<DepartmentRequest>, exceptId?: string) {
  const name = (body.name ?? '').trim()
  const description = (body.description ?? '').trim()
  const duplicate = db.departments.some(
    (department) => department.clubId === clubId && department.status === 'ACTIVE' && department.id !== exceptId && department.name.toLowerCase() === name.toLowerCase(),
  )
  return {
    name,
    description,
    errors: [
      ...(name.length < NAME_MIN || name.length > NAME_MAX ? [{ field: 'name', message: `Tên ban cần từ ${NAME_MIN} đến ${NAME_MAX} ký tự.` }] : []),
      ...(duplicate ? [{ field: 'name', message: 'CLB đã có ban đang hoạt động trùng tên.' }] : []),
      ...(description.length > DESCRIPTION_MAX ? [{ field: 'description', message: `Mô tả tối đa ${DESCRIPTION_MAX} ký tự.` }] : []),
    ],
  }
}

/** Phạm vi hợp lệ của chức vụ thường trực: CLB với ban chủ nhiệm, ban đang hoạt động với trưởng, phó ban. */
function validScope(clubId: string, role: StandingRole, scopeId: string | null | undefined): boolean {
  if (BOARD_ROLES.includes(role)) return scopeId === clubId
  return db.departments.some((department) => department.id === scopeId && department.clubId === clubId && department.status === 'ACTIVE')
}

/** BR-ORG-01: chức vụ thường trực chỉ cho thành viên Chính thức; trưởng, phó ban phải thuộc đúng ban đó. */
function candidatesFor(clubId: string, role: StandingRole, scopeId: string): PositionCandidate[] {
  const holders = new Set(db.positions.filter((position) => position.role === role && position.scopeId === scopeId && isPositionOpen(position)).map((position) => position.userId))
  return eligibleMembers(clubId, { statuses: ['ACTIVE'], departmentId: BOARD_ROLES.includes(role) ? undefined : scopeId }).filter((member) => !holders.has(member.id))
}

export const orgHandlers = [
  http.get(`${API}/clubs/:clubId/departments`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const status = new URL(request.url).searchParams.get('status') === 'CLOSED' ? 'CLOSED' : 'ACTIVE'
    const departments = db.departments
      .filter((department) => department.clubId === clubId && department.status === status)
      .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((department) => toDepartment(department, user.value.id))
    return HttpResponse.json(departments)
  }),

  http.post(`${API}/clubs/:clubId/departments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_DEPARTMENTS')) return forbidden(clubId, 'MANAGE_DEPARTMENTS', 'khai báo ban chuyên môn')
    const term = currentTermOf(clubId)
    if (!term) return problem(422, 'CLB chưa có nhiệm kỳ đang chạy nên chưa khai báo được ban.', 'NO_RUNNING_TERM')
    const { name, description, errors } = departmentErrors(clubId, (await request.json()) as Partial<DepartmentRequest>)
    if (errors.length > 0) return problem(400, 'Thông tin ban chưa hợp lệ.', 'VALIDATION', errors)
    const department: DbDepartment = {
      id: newId('d'),
      clubId,
      termId: term.id,
      name,
      description,
      status: 'ACTIVE',
      closedOn: null,
      closeReason: null,
      createdAt: nowIso(),
      version: 1,
    }
    db.departments.push(department)
    return HttpResponse.json(toDepartment(department, user.value.id), { status: 201 })
  }),

  http.patch(`${API}/clubs/:clubId/departments/:departmentId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const department = db.departments.find((candidate) => candidate.id === params.departmentId && candidate.clubId === clubId)
    if (!department) return problem(404, 'Không tìm thấy ban.', 'DEPARTMENT_NOT_FOUND')
    if (!can(user.value.id, clubId, 'MANAGE_DEPARTMENTS')) return forbidden(clubId, 'MANAGE_DEPARTMENTS', 'sửa thông tin ban')
    const body = (await request.json()) as Partial<UpdateDepartmentRequest>
    if (body.version !== department.version) return problem(409, 'Ban vừa được người khác cập nhật. Tải lại để xem thông tin mới nhất.', 'VERSION_CONFLICT')
    if (department.status === 'CLOSED') return problem(422, 'Ban đã đóng chỉ để tra cứu, không sửa được.', 'DEPARTMENT_CLOSED')
    const { name, description, errors } = departmentErrors(clubId, body, department.id)
    if (errors.length > 0) return problem(400, 'Thông tin ban chưa hợp lệ.', 'VALIDATION', errors)
    department.name = name
    department.description = description
    department.version += 1
    return HttpResponse.json(toDepartment(department, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/departments/:departmentId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const department = db.departments.find((candidate) => candidate.id === params.departmentId && candidate.clubId === clubId)
    if (!department) return problem(404, 'Không tìm thấy ban.', 'DEPARTMENT_NOT_FOUND')
    if (!can(user.value.id, clubId, 'MANAGE_DEPARTMENTS')) return forbidden(clubId, 'MANAGE_DEPARTMENTS', 'đóng ban')
    const body = (await request.json()) as Partial<CloseDepartmentRequest>
    if (body.action !== 'CLOSE') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    if (body.version !== department.version) return problem(409, 'Ban vừa được người khác cập nhật. Tải lại để xem thông tin mới nhất.', 'VERSION_CONFLICT')
    if (department.status === 'CLOSED') return problem(422, 'Ban đã đóng từ trước.', 'INVALID_TRANSITION')
    const reason = (body.reason ?? '').trim()
    if (reason.length < 5) return problem(400, 'Vui lòng nhập lý do.', 'VALIDATION', [{ field: 'reason', message: 'Nhập ít nhất 5 ký tự.' }])
    const members = departmentMemberCount(department.id)
    if (members > 0) {
      return problem(422, `Ban ${department.name} còn ${members} thành viên có ban chính là ban này. Chuyển họ sang ban khác bằng nút Chuyển thành viên trước khi đóng.`, 'DEPARTMENT_NOT_EMPTY')
    }
    const leads = db.positions.filter((position) => position.scopeId === department.id && isPositionOpen(position))
    if (leads.length > 0) {
      const titles = leads.map((position) => `${positionTitles[position.role]} ${personRef(position.userId).fullName}`).join(', ')
      return problem(422, `Ban ${department.name} còn chức vụ chưa kết thúc (${titles}). Thu hồi trước khi đóng ban.`, 'DEPARTMENT_HAS_POSITIONS')
    }
    department.status = 'CLOSED'
    department.closedOn = vnToday()
    department.closeReason = reason
    department.version += 1
    return HttpResponse.json(toDepartment(department, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/positions`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const url = new URL(request.url)
    const termId = url.searchParams.get('termId')
    const scopeType = url.searchParams.get('scopeType')
    const scopeId = url.searchParams.get('scopeId')
    const userId = url.searchParams.get('userId')
    const keyword = url.searchParams.get('q')
    if (scopeType !== null && !SCOPE_TYPES.includes(scopeType as PositionScopeType)) {
      return problem(400, 'Loại phạm vi không hợp lệ.', 'VALIDATION', [{ field: 'scopeType', message: 'Loại phạm vi không hợp lệ.' }])
    }
    // FR-ORG-06: nhiệm kỳ đã đóng thì tra chức vụ thường trực của nhiệm kỳ đó, tên ban theo lúc nhiệm kỳ đóng.
    const term = termId === null ? undefined : db.terms.find((candidate) => candidate.id === termId && candidate.clubId === clubId)
    if (termId !== null && !term) return problem(404, 'Không tìm thấy nhiệm kỳ.', 'TERM_NOT_FOUND')
    if (term && term.status === 'PREPARING') {
      return problem(400, 'Nhiệm kỳ chưa bắt đầu nên chưa có chức vụ để tra cứu.', 'VALIDATION', [{ field: 'termId', message: 'Chọn nhiệm kỳ hiện tại hoặc đã đóng.' }])
    }
    const closedTerm = term?.status === 'CLOSED' ? term : undefined
    const departmentNames = new Map((closedTerm?.closedDepartments ?? []).map((department) => [department.id, department.name]))
    const rows = db.positions
      .filter((position) => (closedTerm ? heldDuring(position, closedTerm) : position.clubId === clubId && isPositionListed(position)))
      .map((position) => ({ position, dto: toPosition(position, user.value.id, departmentNames) }))
      .filter(({ position, dto }) => (!scopeId || position.scopeId === scopeId) && (!userId || position.userId === userId) && (!scopeType || dto.scope.type === scopeType))
      .filter(({ dto }) => matchesKeyword(`${dto.holder.fullName} ${dto.scope.name}`, keyword))
      .toSorted((a, b) => roleOrder(a.position) - roleOrder(b.position) || a.dto.scope.name.localeCompare(b.dto.scope.name, 'vi') || a.position.startOn.localeCompare(b.position.startOn))
      .map(({ dto }) => dto)
    return HttpResponse.json(paginate(rows, url, 50))
  }),

  http.get(`${API}/clubs/:clubId/position-candidates`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'ASSIGN_POSITIONS')) return forbidden(clubId, 'ASSIGN_POSITIONS', 'gán chức vụ')
    const url = new URL(request.url)
    const role = url.searchParams.get('role')
    const scopeId = url.searchParams.get('scopeId')
    if (!isStanding(role) || !scopeId || !validScope(clubId, role, scopeId)) return problem(400, 'Chức vụ hoặc phạm vi không hợp lệ.', 'VALIDATION')
    if (PRESIDENCY_ROLES.includes(role) && !isPresidency(user.value.id, clubId)) return presidencyOnly()
    return HttpResponse.json(candidatesFor(clubId, role, scopeId))
  }),

  http.post(`${API}/clubs/:clubId/positions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'ASSIGN_POSITIONS')) return forbidden(clubId, 'ASSIGN_POSITIONS', 'gán chức vụ')
    const body = (await request.json()) as Partial<CreatePositionRequest>
    const role = body.role
    if (!isStanding(role)) return problem(400, 'Chức vụ không hợp lệ.', 'VALIDATION', [{ field: 'role', message: 'Chọn một chức vụ thường trực.' }])
    if (PRESIDENCY_ROLES.includes(role) && !isPresidency(user.value.id, clubId)) return presidencyOnly()
    if (openHandoverOf(clubId)) {
      return problem(422, 'CLB đang bàn giao nhiệm kỳ nên chưa gán chức vụ thường trực mới. Người của nhiệm kỳ mới ghi ở kết quả bầu.', 'HANDOVER_IN_PROGRESS')
    }
    if (isTermOverdue(clubId)) {
      return problem(
        422,
        'Nhiệm kỳ đã quá ngày kết thúc nên chưa gán chức vụ thường trực mới. Bắt đầu bàn giao ở trang Nhiệm kỳ (khai báo nhiệm kỳ mới nếu chưa có) rồi ghi người mới ở kết quả bầu.',
        'TERM_OVERDUE',
      )
    }
    const term = currentTermOf(clubId)
    if (!term) return problem(422, 'CLB chưa có nhiệm kỳ đang chạy nên chưa gán được chức vụ.', 'NO_RUNNING_TERM')
    if (!validScope(clubId, role, body.scopeId)) return problem(400, 'Phạm vi không hợp lệ.', 'VALIDATION', [{ field: 'scopeId', message: 'Chọn ban đang hoạt động của CLB.' }])
    const scopeId = body.scopeId as string
    const startOn = body.startOn ?? ''
    const endOn = body.endOn ?? ''
    const eligible = candidatesFor(clubId, role, scopeId).some((candidate) => candidate.id === body.userId)
    const alreadyHolds = db.positions.some((position) => position.userId === body.userId && position.role === role && position.scopeId === scopeId && isPositionOpen(position))
    if (alreadyHolds) return problem(409, 'Người này đang giữ chức vụ này ở phạm vi đã chọn.', 'ALREADY_HOLDS')
    const errors = [
      ...(!eligible
        ? [{ field: 'userId', message: 'Người được chọn không đủ điều kiện: cần là thành viên Chính thức, với trưởng, phó ban phải thuộc đúng ban.' }]
        : []),
      ...(!DATE_PATTERN.test(startOn) || startOn < term.startOn || startOn > term.endOn ? [{ field: 'startOn', message: 'Ngày bắt đầu phải nằm trong nhiệm kỳ hiện tại.' }] : []),
      ...(!DATE_PATTERN.test(endOn) || endOn < startOn || endOn > term.endOn
        ? [{ field: 'endOn', message: 'Ngày kết thúc phải sau ngày bắt đầu và không quá ngày cuối nhiệm kỳ.' }]
        : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin gán chức vụ chưa hợp lệ.', 'VALIDATION', errors)
    const position = grantPosition({ userId: body.userId as string, clubId, role, scopeId, assignedBy: user.value.id, startOn, endOn })
    notify([position.userId], {
      clubId,
      category: 'POSITION',
      title: `Bạn được gán chức ${positionTitleOf(position)}${startOn > vnToday() ? ` từ ${formatDate(startOn)}` : ''}`,
      target: structureTarget(clubId),
      actorId: user.value.id,
    })
    return HttpResponse.json(toPosition(position, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/positions/:positionId/revocation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const position = db.positions.find((candidate) => candidate.id === params.positionId && candidate.clubId === clubId)
    if (!position) return problem(404, 'Không tìm thấy chức vụ.', 'POSITION_NOT_FOUND')
    if (!can(user.value.id, clubId, 'ASSIGN_POSITIONS')) return forbidden(clubId, 'ASSIGN_POSITIONS', 'thu hồi chức vụ')
    if (!STANDING_ROLES.includes(position.role)) return problem(422, 'Chức vụ trong sự kiện được thay đổi ở trang sự kiện đó.', 'EVENT_POSITION')
    const body = (await request.json()) as Partial<RevokePositionRequest>
    if (body.version !== position.version) return problem(409, 'Chức vụ vừa được người khác cập nhật. Tải lại để xem thông tin mới nhất.', 'VERSION_CONFLICT')
    if (!isPositionOpen(position)) return problem(422, 'Chức vụ này đã kết thúc.', 'INVALID_TRANSITION')
    const reason = (body.reason ?? '').trim()
    const handoverOn = body.handoverOn ?? ''
    const latest = effectiveEndOf(position) ?? NO_END
    const errors = [
      ...(reason.length < 5 ? [{ field: 'reason', message: 'Nhập ít nhất 5 ký tự.' }] : []),
      ...(!DATE_PATTERN.test(handoverOn) || handoverOn < vnToday() || handoverOn > latest
        ? [{ field: 'handoverOn', message: 'Ngày chuyển giao từ hôm nay đến hết hạn của chức vụ.' }]
        : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin thu hồi chưa hợp lệ.', 'VALIDATION', errors)
    const kept = { startOn: position.startOn, endOn: shiftDate(handoverOn, -1) }
    if (position.role === 'PRESIDENT' && !presidentsCoverTerm(clubId, (candidate) => candidate.id === position.id, [kept])) {
      return problem(
        422,
        `CLB phải luôn có ít nhất một Chủ nhiệm đến hết nhiệm kỳ. ${lastPresidentHint(clubId)}`,
        'LAST_PRESIDENT',
      )
    }
    endPositions((candidate) => candidate.id === position.id, { reason, handoverOn })
    notify([position.userId], {
      clubId,
      category: 'POSITION',
      title: `Chức ${positionTitleOf(position)} của bạn được thu hồi từ ${formatDate(handoverOn)}`,
      body: `Lý do: ${reason}`,
      target: structureTarget(clubId),
      actorId: user.value.id,
    })
    return HttpResponse.json(toPosition(position, user.value.id))
  }),
]

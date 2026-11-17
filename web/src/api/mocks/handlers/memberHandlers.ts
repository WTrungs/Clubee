import { http, HttpResponse } from 'msw'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import type {
  CreateJoinRequest,
  JoinRequest,
  JoinRequestReceipt,
  MemberDetail,
  MemberFacets,
  MemberInfoField,
  MemberRoleFilter,
  MemberSummary,
  MemberTransitionAction,
  MemberTransitionRequest,
  PastMembership,
  DepartmentStint,
  DepartmentTransferRequest,
  DepartmentTransferResult,
  UpdateMemberInfoRequest,
} from '@/features/member/model/memberTypes'
import { formatDate } from '@/shared/format/formatDate'
import { DISPLAY_TITLE_MAX, INTERNAL_NOTE_MAX, STUDENT_ID_MESSAGE, STUDENT_ID_PATTERN } from '@/shared/lib/memberInfoRules'
import { db, type DbBacklogItem, type DbInvitation, type DbMembership, type DbPosition } from '../db'
import { can, forbidden } from '../mockAccess'
import { backlogState } from '../mockBacklog'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { invitationIsFor, invitationStatus } from '../mockInvitations'
import { canAccessClub, closeDepartmentStint, membershipOf, openDepartmentStint, personRef, ROSTER_STATUSES, transferDepartment } from '../mockMembers'
import { DEPARTMENT_ROLES, endPositions, isBoardMember, isPositionOpen, positionsIn, positionTitleOf, positionTitlesOf, presidentsCoverTerm, STANDING_ROLES } from '../mockPermissions'
import { closePendingLeaveRequest, putOnLeaveBlock } from '../mockMembership'
import { clubTarget, notify, structureTarget } from '../mockNotifications'
import { isTaskActive } from '../mockScopes'
import { canAssignStanding, lastPresidentHint, openHandoverOf } from '../mockTerms'
import { isRealDate, nowIso, vnToday } from '../mockTime'
import { blankMemberInfo } from '../seed/memberSeed'

/** Bảng ST-MEM (SRS 4.2): trạng thái được chuyển từ đâu sang đâu. */
export const MEMBER_TRANSITIONS: Record<MemberTransitionAction, { from: MemberStatus[]; to: MemberStatus }> = {
  APPROVE_PROBATION: { from: ['PENDING'], to: 'PROBATION' },
  APPROVE_ACTIVE: { from: ['PENDING'], to: 'ACTIVE' },
  REJECT: { from: ['PENDING'], to: 'LEFT' },
  CONFIRM: { from: ['PROBATION'], to: 'ACTIVE' },
  PUT_ON_LEAVE: { from: ['ACTIVE'], to: 'ON_LEAVE' },
  RETURN: { from: ['ON_LEAVE'], to: 'ACTIVE' },
  REMOVE: { from: ['PROBATION', 'ACTIVE', 'ON_LEAVE'], to: 'LEFT' },
}

const ACTIONS = Object.keys(MEMBER_TRANSITIONS) as MemberTransitionAction[]
const APPROVALS: MemberTransitionAction[] = ['APPROVE_PROBATION', 'APPROVE_ACTIVE']
const LISTABLE: MemberStatus[] = ['PROBATION', 'ACTIVE', 'ON_LEAVE', 'LEFT']
/** Người đang sinh hoạt (kể cả Tạm nghỉ) mới có ban chính để chuyển (FR-MEM-10). */
const TRANSFERABLE: MemberStatus[] = ['PROBATION', 'ACTIVE', 'ON_LEAVE']
const TRANSFER_MAX = 50
const ROLE_FILTERS: MemberRoleFilter[] = ['PRESIDENT', 'VICE_PRESIDENT', 'TREASURER', 'DEPARTMENT_HEAD', 'DEPARTMENT_VICE_HEAD', 'NONE']
const INTRO_MIN = 10
const INTRO_MAX = 500

const statusLabel: Record<MemberStatus, string> = {
  PENDING: 'Chờ duyệt',
  PROBATION: 'Thử việc',
  ACTIVE: 'Chính thức',
  ON_LEAVE: 'Tạm nghỉ',
  LEFT: 'Đã rời',
}

const clubOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)
const departmentRef = (departmentId: string | null) => {
  const department = db.departments.find((candidate) => candidate.id === departmentId)
  return department ? { id: department.id, name: department.name } : null
}

/** Chuyển máy chủ cho phép người xem thực hiện; không ai tự chuyển trạng thái của mình (FR-MEM-07 là luồng riêng). */
function memberActions(membership: DbMembership, viewerId: string): MemberTransitionAction[] {
  if (membership.userId === viewerId || !can(viewerId, membership.clubId, 'MANAGE_MEMBERS')) return []
  const probation = clubOf(membership.clubId)?.probationStep ?? true
  const appointee = openHandoverOf(membership.clubId)?.appointments.some((appointment) => appointment.userId === membership.userId) ?? false
  return ACTIONS.filter(
    (action) =>
      MEMBER_TRANSITIONS[action].from.includes(membership.status) && (action !== 'APPROVE_PROBATION' || probation) && (action !== 'PUT_ON_LEAVE' || !appointee),
  )
}

function toSummary(membership: DbMembership, viewerId: string): MemberSummary {
  const board = isBoardMember(viewerId, membership.clubId)
  const user = db.users.find((candidate) => candidate.id === membership.userId)
  const collects = clubOf(membership.clubId)?.collectsStudentId ?? false
  return {
    membershipId: membership.id,
    person: personRef(membership.userId),
    status: membership.status,
    department: departmentRef(membership.departmentId),
    positionTitles: membership.status === 'LEFT' ? [] : positionTitlesOf(membership.userId, membership.clubId),
    displayTitle: membership.displayTitle,
    joinedOn: membership.joinedOn,
    // SĐT, email, MSSV chỉ trả cho ban chủ nhiệm (SRS 3.5, NFR-SEC-04).
    contact: board && user ? { email: user.email, phone: user.phone } : null,
    studentId: board && collects ? membership.studentId : null,
    version: membership.version,
  }
}

function pastMembershipsOf(membership: DbMembership): PastMembership[] {
  return db.memberships
    .filter((candidate) => candidate.userId === membership.userId && candidate.clubId === membership.clubId && candidate.id !== membership.id && candidate.status === 'LEFT')
    .toSorted((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((candidate) => ({
      membershipId: candidate.id,
      joinedOn: candidate.joinedOn,
      leftOn: candidate.leftOn,
      exitKind: candidate.exitKind,
      reason: candidate.leaveReason,
      departmentName: departmentRef(candidate.departmentId)?.name ?? null,
    }))
}

/** Trưởng ban, Phó ban chưa kết thúc (kể cả chưa tới ngày bắt đầu) ở ban chính hiện tại của người này. */
function openDepartmentPositionsOf(membership: DbMembership): DbPosition[] {
  return db.positions.filter(
    (position) =>
      position.userId === membership.userId &&
      position.clubId === membership.clubId &&
      DEPARTMENT_ROLES.includes(position.role) &&
      position.scopeId === membership.departmentId &&
      isPositionOpen(position),
  )
}

/** Các ban chính đã qua, mới nhất trước; khoảng bị hủy trong ngày (chuyển hai lần một ngày) không hiện. */
function departmentHistoryOf(membership: DbMembership): DepartmentStint[] {
  return membership.departmentHistory
    .filter((stint) => stint.toOn === null || stint.toOn >= stint.fromOn)
    .toReversed()
    .map((stint) => ({
      department: departmentRef(stint.departmentId) ?? { id: stint.departmentId, name: 'Ban không còn tồn tại' },
      fromOn: stint.fromOn,
      toOn: stint.toOn,
      changedBy: stint.changedBy ? personRef(stint.changedBy) : null,
    }))
}

function toDetail(membership: DbMembership, viewerId: string): MemberDetail {
  const board = isBoardMember(viewerId, membership.clubId)
  return {
    ...toSummary(membership, viewerId),
    // Ngày và hình thức rời (bị từ chối, bị đưa ra) là thông tin nội bộ của ban chủ nhiệm (SRS 3.5).
    leftOn: board ? membership.leftOn : null,
    exitKind: board ? membership.exitKind : null,
    leaveReason: board ? membership.leaveReason : null,
    internalNote: board ? membership.internalNote : null,
    infoHistory: board
      ? membership.infoHistory.toReversed().map((change) => ({ at: change.at, actor: personRef(change.actorId), field: change.field, from: change.from, to: change.to }))
      : null,
    history: board
      ? membership.history.toReversed().map((change) => ({ at: change.at, actor: personRef(change.actorId), fromStatus: change.fromStatus, toStatus: change.toStatus, reason: change.reason }))
      : null,
    pastMemberships: board ? pastMembershipsOf(membership) : null,
    departmentHistory: board ? departmentHistoryOf(membership) : null,
    backlogCount: board ? db.backlogItems.filter((item) => item.membershipId === membership.id && backlogState(item).status === 'OPEN').length : null,
    // BR-ORG-01: chức vụ thường trực chỉ gán cho thành viên Chính thức.
    allowedActions: [
      ...memberActions(membership, viewerId),
      ...(membership.status === 'ACTIVE' && can(viewerId, membership.clubId, 'ASSIGN_POSITIONS') && canAssignStanding(membership.clubId) ? (['ASSIGN_POSITION'] as const) : []),
      // Hồ sơ của người đã rời giữ nguyên như lúc rời (BR-DATA-02).
      ...(membership.status !== 'LEFT' && can(viewerId, membership.clubId, 'MANAGE_MEMBERS') ? (['EDIT_INFO'] as const) : []),
      ...(TRANSFERABLE.includes(membership.status) && can(viewerId, membership.clubId, 'MANAGE_MEMBERS') ? (['TRANSFER_DEPARTMENT'] as const) : []),
    ],
    version: membership.version,
  }
}

/** Người tạo lời mời mà yêu cầu đã dùng (FR-MEM-01). */
function invitedByOf(membership: DbMembership) {
  const invitation = membership.invitationId ? db.invitations.find((candidate) => candidate.id === membership.invitationId) : undefined
  return invitation ? personRef(invitation.createdBy) : null
}

function toJoinRequest(membership: DbMembership, viewerId: string): JoinRequest {
  const user = db.users.find((candidate) => candidate.id === membership.userId)
  return {
    membershipId: membership.id,
    applicant: personRef(membership.userId),
    contact: { email: user?.email ?? '', phone: user?.phone ?? null },
    studentId: clubOf(membership.clubId)?.collectsStudentId ? membership.studentId : null,
    introduction: membership.introduction ?? '',
    requestedAt: membership.requestedAt,
    invitedBy: invitedByOf(membership),
    pastMemberships: pastMembershipsOf(membership),
    allowedActions: memberActions(membership, viewerId),
    version: membership.version,
  }
}

/** FR-NOT-02: báo người gửi yêu cầu khi yêu cầu được xử lý, báo người bị đưa ra khỏi CLB kèm lý do. */
function notifyMembershipChange(membership: DbMembership, action: MemberTransitionAction, reason: string, actorId: string): void {
  const clubId = membership.clubId
  const clubName = clubOf(clubId)?.name ?? 'CLB'
  const input = { clubId, category: 'MEMBERSHIP' as const, actorId }
  if (APPROVALS.includes(action)) {
    notify([membership.userId], { ...input, title: `Yêu cầu gia nhập ${clubName} đã được duyệt`, target: clubTarget(clubId) })
  } else if (action === 'REJECT') {
    notify([membership.userId], { ...input, title: `Yêu cầu gia nhập ${clubName} bị từ chối`, body: `Lý do: ${reason}`, target: { type: 'DIRECTORY', clubId: null, id: null } })
  } else if (action === 'REMOVE') {
    notify([membership.userId], { ...input, title: `Bạn đã bị đưa ra khỏi ${clubName}`, body: `Lý do: ${reason}` })
  }
}

/** FR-MEM-08, BR-MEM-04: thu hồi ngay mọi chức vụ, rút khỏi BTC, đưa chức vụ và việc dở vào danh sách tồn đọng. */
function removeFromClub(membership: DbMembership, reason: string): void {
  const { userId, clubId } = membership
  const createdAt = nowIso()
  const backlog = (kind: DbBacklogItem['kind'], refId: string) =>
    db.backlogItems.push({ id: newId('b'), clubId, membershipId: membership.id, formerMemberId: userId, kind, refId, createdAt, resolution: null, version: 1 })
  for (const position of endPositions((candidate) => candidate.userId === userId && candidate.clubId === clubId, { reason: `Bị đưa ra khỏi CLB: ${reason}` })) {
    backlog('POSITION', position.id)
  }
  const clubEvents = new Set(db.events.filter((event) => event.clubId === clubId).map((event) => event.id))
  for (const staff of db.eventStaff) {
    if (staff.userId === userId && clubEvents.has(staff.eventId) && staff.leftAt === null) staff.leftAt = createdAt
  }
  for (const task of db.tasks) {
    // Việc của sự kiện đã đóng, hủy chỉ còn để tra cứu nên không cần người thay (FR-EVT-16).
    if (task.clubId !== clubId || !isTaskActive(task)) continue
    if (task.ownerId === userId) backlog('TASK', task.id)
    // Chỉ người giao được nghiệm thu (BR-TASK-02); việc tự giao cho mình cần cả người làm mới lẫn người nghiệm thu mới.
    if (task.assignerId === userId) backlog('TASK_REVIEW', task.id)
  }
}

function matchesRole(membership: DbMembership, role: string | null): boolean {
  if (!role || !ROLE_FILTERS.includes(role as MemberRoleFilter)) return true
  const standing = positionsIn(membership.userId, membership.clubId).filter((position) => STANDING_ROLES.includes(position.role))
  return role === 'NONE' ? standing.length === 0 : standing.some((position) => position.role === role)
}

/** Chỉ tư cách đã từng gia nhập mới là thành viên; yêu cầu chờ duyệt hoặc bị từ chối thuộc hồ sơ gia nhập của ban chủ nhiệm (FR-MEM-03). */
const wasMember = (membership: DbMembership) => membership.joinedOn !== null

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const notFound = () => problem(404, 'Không tìm thấy thành viên.', 'MEMBER_NOT_FOUND')

const INFO_FIELDS: MemberInfoField[] = ['displayTitle', 'internalNote', 'studentId', 'joinedOn']
/** Body JSON có thể chứa kiểu bất kỳ; giá trị không phải chuỗi coi như rỗng. */
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const orNull = (value: string) => (value === '' ? null : value)

/** Trưởng tiểu ban là nhân sự CLB đồng tổ chức không cần tư cách thành viên CLB chủ trì (BR-ORG-01), nên không ràng buộc ngày gia nhập. */
const heldAsCoHost = (position: DbPosition) =>
  position.role === 'SUBCOMMITTEE_LEAD' && db.eventStaff.some((staff) => staff.subcommitteeId === position.scopeId && staff.userId === position.userId && staff.kind === 'CO_HOST')

/** Ngày gia nhập không trước lần rời CLB trước (bị từ chối thì chưa từng gia nhập), không sau ngày bắt đầu chức vụ đầu tiên của lần sinh hoạt này (BR-ORG-01). */
function joinedOnBounds(membership: DbMembership): { notBefore: string | null; notAfter: string | null } {
  const previousLeftOn = db.memberships
    .filter((candidate) => candidate.userId === membership.userId && candidate.clubId === membership.clubId && candidate.id !== membership.id)
    .flatMap((candidate) => (candidate.joinedOn !== null && candidate.leftOn !== null ? [candidate.leftOn] : []))
    .toSorted()
    .at(-1)
  const firstPosition = db.positions
    .filter((position) => position.userId === membership.userId && position.clubId === membership.clubId && (!previousLeftOn || position.startOn >= previousLeftOn))
    .filter((position) => (position.endOn === null || position.endOn >= position.startOn) && !heldAsCoHost(position))
    .map((position) => position.startOn)
    .toSorted()[0]
  return { notBefore: previousLeftOn ?? null, notAfter: firstPosition ?? null }
}

/** Mốc ngày chỉ xét khi ngày gia nhập thật sự đổi: dữ liệu cũ có thể lệch mốc (ví dụ chức vụ gán từ đầu nhiệm kỳ) mà vẫn phải sửa được trường khác. */
function joinedOnError(membership: DbMembership, joinedOn: string, foundedOn: string): string | null {
  if (joinedOn === membership.joinedOn) return null
  if (!isRealDate(joinedOn)) return 'Ngày gia nhập không hợp lệ.'
  if (joinedOn > vnToday()) return 'Ngày gia nhập không được sau hôm nay.'
  if (joinedOn < foundedOn) return `Ngày gia nhập không được trước ngày thành lập CLB (${formatDate(foundedOn)}).`
  const bounds = joinedOnBounds(membership)
  if (bounds.notBefore && joinedOn < bounds.notBefore) return `Ngày gia nhập phải từ ngày rời CLB lần trước (${formatDate(bounds.notBefore)}).`
  if (bounds.notAfter && joinedOn > bounds.notAfter) return `Ngày gia nhập không được sau ngày bắt đầu chức vụ đầu tiên (${formatDate(bounds.notAfter)}).`
  return null
}

/** FR-MEM-05: chuẩn hóa và kiểm tra bốn trường; CLB không thu thập MSSV thì giữ nguyên MSSV đang có. */
function memberInfoInput(membership: DbMembership, body: Partial<UpdateMemberInfoRequest>, collectsStudentId: boolean, foundedOn: string) {
  const values: Pick<DbMembership, MemberInfoField> = {
    displayTitle: orNull(text(body.displayTitle)),
    internalNote: orNull(text(body.internalNote)),
    studentId: collectsStudentId ? orNull(text(body.studentId)) : membership.studentId,
    joinedOn: text(body.joinedOn),
  }
  // Thiếu trường thì báo lỗi thay vì coi như xóa, để yêu cầu gửi thiếu không làm mất ghi chú im lặng.
  const missing = INFO_FIELDS.filter((field) => !(field in body)).map((field) => ({ field, message: 'Thiếu trường này trong yêu cầu.' }))
  if (missing.length > 0) return { values, errors: missing }
  const dateError = joinedOnError(membership, values.joinedOn ?? '', foundedOn)
  const errors = [
    ...((values.displayTitle ?? '').length > DISPLAY_TITLE_MAX ? [{ field: 'displayTitle', message: `Chức danh tối đa ${DISPLAY_TITLE_MAX} ký tự.` }] : []),
    ...((values.internalNote ?? '').length > INTERNAL_NOTE_MAX ? [{ field: 'internalNote', message: `Ghi chú tối đa ${INTERNAL_NOTE_MAX} ký tự.` }] : []),
    ...(collectsStudentId && values.studentId !== null && !STUDENT_ID_PATTERN.test(values.studentId) ? [{ field: 'studentId', message: STUDENT_ID_MESSAGE }] : []),
    ...(dateError ? [{ field: 'joinedOn', message: dateError }] : []),
  ]
  return { values, errors }
}

export const memberHandlers = [
  http.post(`${API}/clubs/:clubId/join-requests`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const club = clubOf(String(params.clubId))
    if (!club) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
    const current = membershipOf(user.value.id, club.id)
    if (current) {
      return problem(409, `Bạn đang có tư cách ${statusLabel[current.status]} ở CLB này; mỗi người chỉ có một tư cách đang hoạt động.`, 'ALREADY_MEMBER')
    }
    const body = (await request.json()) as Partial<CreateJoinRequest>
    // FR-MEM-01: đi qua lời mời vẫn tạo yêu cầu Chờ duyệt, chỉ ghi lại lời mời đã dùng.
    let invitation: DbInvitation | undefined
    if (body.invitationToken !== undefined) {
      invitation = db.invitations.find((candidate) => candidate.token === body.invitationToken && candidate.clubId === club.id)
      if (invitation && !invitationIsFor(invitation, user.value.id)) {
        return problem(403, 'Lời mời này gửi tới một email khác. Hãy đăng nhập bằng tài khoản có email được mời.', 'INVITATION_FOR_OTHER')
      }
      if (!invitation || invitationStatus(invitation) !== 'ACTIVE') {
        return problem(422, 'Lời mời không còn hiệu lực. Bạn vẫn có thể tìm CLB ở mục Tìm CLB để gửi yêu cầu.', 'INVITATION_NOT_ACTIVE')
      }
    }
    const introduction = (body.introduction ?? '').trim()
    const studentId = (body.studentId ?? '').trim()
    const errors = [
      ...(introduction.length < INTRO_MIN || introduction.length > INTRO_MAX
        ? [{ field: 'introduction', message: `Lời giới thiệu cần từ ${INTRO_MIN} đến ${INTRO_MAX} ký tự.` }]
        : []),
      ...(club.collectsStudentId && !STUDENT_ID_PATTERN.test(studentId) ? [{ field: 'studentId', message: STUDENT_ID_MESSAGE }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin yêu cầu gia nhập chưa hợp lệ.', 'VALIDATION', errors)
    const requestedAt = nowIso()
    const membership: DbMembership = {
      id: newId('m'),
      userId: user.value.id,
      clubId: club.id,
      status: 'PENDING',
      departmentId: null,
      departmentHistory: [],
      requestedAt,
      joinedOn: null,
      leftOn: null,
      exitKind: null,
      leaveReason: null,
      introduction,
      studentId: club.collectsStudentId ? studentId : null,
      ...blankMemberInfo(),
      history: [{ at: requestedAt, actorId: user.value.id, fromStatus: null, toStatus: 'PENDING', reason: null }],
      ...(invitation ? { invitationId: invitation.id } : {}),
      version: 1,
    }
    db.memberships.push(membership)
    if (invitation) invitation.useCount += 1
    const receipt: JoinRequestReceipt = { membershipId: membership.id, status: membership.status, requestedAt }
    return HttpResponse.json(receipt, { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/join-requests`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return forbidden(clubId, 'MANAGE_MEMBERS', 'xem yêu cầu gia nhập')
    const pending = db.memberships
      .filter((membership) => membership.clubId === clubId && membership.status === 'PENDING')
      .toSorted((a, b) => a.requestedAt.localeCompare(b.requestedAt))
    const page = paginate(pending, new URL(request.url), 20)
    return HttpResponse.json({ ...page, content: page.content.map((membership) => toJoinRequest(membership, user.value.id)) })
  }),

  http.get(`${API}/clubs/:clubId/members/facets`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const years = db.memberships
      .filter((membership) => membership.clubId === clubId && membership.joinedOn)
      .map((membership) => Number(membership.joinedOn?.slice(0, 4)))
    const facets: MemberFacets = {
      departments: db.departments
        .filter((department) => department.clubId === clubId)
        .toSorted((a, b) => Number(a.status === 'CLOSED') - Number(b.status === 'CLOSED') || a.name.localeCompare(b.name, 'vi'))
        .map((department) => ({ id: department.id, name: department.name, closed: department.status === 'CLOSED' })),
      joinYears: [...new Set(years)].toSorted((a, b) => b - a),
    }
    return HttpResponse.json(facets)
  }),

  http.get(`${API}/clubs/:clubId/members`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const url = new URL(request.url)
    const requested = url.searchParams.getAll('status').filter((status): status is MemberStatus => LISTABLE.includes(status as MemberStatus))
    const statuses = requested.length > 0 ? requested : ROSTER_STATUSES
    const departmentId = url.searchParams.get('departmentId')
    const joinYear = url.searchParams.get('joinYear')
    const keyword = url.searchParams.get('q')
    const board = isBoardMember(user.value.id, clubId)
    const rows = db.memberships
      .filter((membership) => membership.clubId === clubId && statuses.includes(membership.status) && wasMember(membership))
      .filter((membership) => !departmentId || membership.departmentId === departmentId)
      .filter((membership) => !joinYear || membership.joinedOn?.startsWith(joinYear))
      .filter((membership) => matchesRole(membership, url.searchParams.get('role')))
      .filter((membership) => {
        const user = db.users.find((candidate) => candidate.id === membership.userId)
        // Chỉ ban chủ nhiệm tìm được theo email, MSSV vì chỉ họ được xem các trường này.
        const visible = `${user?.fullName ?? ''} ${membership.displayTitle ?? ''}`
        const searchable = board ? `${visible} ${user?.email ?? ''} ${membership.studentId ?? ''}` : visible
        return matchesKeyword(searchable, keyword)
      })
      .toSorted((a, b) => personRef(a.userId).fullName.localeCompare(personRef(b.userId).fullName, 'vi'))
    const page = paginate(rows, url, 50)
    return HttpResponse.json({ ...page, content: page.content.map((membership) => toSummary(membership, user.value.id)) })
  }),

  http.get(`${API}/clubs/:clubId/members/:membershipId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const membership = db.memberships.find((candidate) => candidate.id === params.membershipId && candidate.clubId === clubId && wasMember(candidate))
    if (!membership) return notFound()
    return HttpResponse.json(toDetail(membership, user.value.id))
  }),

  http.patch(`${API}/clubs/:clubId/members/:membershipId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return forbidden(clubId, 'MANAGE_MEMBERS', 'sửa thông tin thành viên')
    const membership = db.memberships.find((candidate) => candidate.id === params.membershipId && candidate.clubId === clubId && wasMember(candidate))
    const club = clubOf(clubId)
    if (!membership || !club) return notFound()
    const body = (await request.json()) as Partial<UpdateMemberInfoRequest>
    if (body.version !== membership.version) {
      return problem(409, 'Thông tin thành viên vừa được người khác cập nhật. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
    }
    if (membership.status === 'LEFT') return problem(422, 'Người đã rời CLB nên hồ sơ được giữ nguyên như lúc rời.', 'MEMBER_LEFT')
    const { values, errors } = memberInfoInput(membership, body, club.collectsStudentId, club.foundedOn)
    if (errors.length > 0) return problem(400, 'Thông tin thành viên chưa hợp lệ.', 'VALIDATION', errors)
    const at = nowIso()
    const changes = INFO_FIELDS.filter((field) => membership[field] !== values[field]).map((field) => ({ at, actorId: user.value.id, field, from: membership[field], to: values[field] }))
    // Lưu lại không đổi gì thì không tăng version, để người đang sửa song song không bị 409 oan.
    if (changes.length > 0) {
      Object.assign(membership, values)
      membership.infoHistory.push(...changes)
      membership.version += 1
    }
    return HttpResponse.json(toDetail(membership, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/members/:membershipId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    // Kiểm tra quyền trước khi tìm bản ghi để người ngoài ban chủ nhiệm không dò được mã tư cách nào có thật.
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return forbidden(clubId, 'MANAGE_MEMBERS', 'duyệt hoặc chuyển trạng thái thành viên')
    const membership = db.memberships.find((candidate) => candidate.id === params.membershipId && candidate.clubId === clubId)
    if (!membership) return notFound()
    const body = (await request.json()) as Partial<MemberTransitionRequest>
    const action = body.action
    if (!action || !ACTIONS.includes(action)) return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    if (body.version !== membership.version) {
      return problem(409, 'Thông tin thành viên vừa được người khác cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    }
    if (membership.userId === user.value.id) {
      return problem(422, 'Bạn không thể tự chuyển trạng thái của mình; hãy dùng chức năng xin tạm nghỉ hoặc xin rời.', 'SELF_TRANSITION')
    }
    const rule = MEMBER_TRANSITIONS[action]
    if (!rule.from.includes(membership.status)) {
      return problem(422, `Không thể thực hiện khi thành viên đang ở trạng thái ${statusLabel[membership.status]}.`, 'INVALID_TRANSITION')
    }
    const club = clubOf(clubId)
    if (action === 'APPROVE_PROBATION' && !club?.probationStep) {
      return problem(422, 'CLB không dùng bước thử việc; hãy duyệt thẳng sang Chính thức.', 'INVALID_TRANSITION')
    }
    const approval = APPROVALS.includes(action)
    const reason = (body.reason ?? '').trim()
    if (!approval && reason.length < 5) return problem(400, 'Vui lòng nhập lý do.', 'VALIDATION', [{ field: 'reason', message: 'Nhập ít nhất 5 ký tự.' }])
    const department = db.departments.find((candidate) => candidate.id === body.departmentId && candidate.clubId === clubId && candidate.status === 'ACTIVE')
    if (approval && !department) {
      return problem(400, 'Chọn ban chính cho thành viên.', 'VALIDATION', [{ field: 'departmentId', message: 'Chọn một ban đang hoạt động của CLB.' }])
    }
    const name = personRef(membership.userId).fullName
    if (action === 'PUT_ON_LEAVE') {
      const blocked = putOnLeaveBlock(membership, name)
      if (blocked) return blocked
    }
    if (action === 'REMOVE') {
      const holdsPresident = db.positions.some(
        (position) => position.userId === membership.userId && position.clubId === clubId && position.role === 'PRESIDENT' && isPositionOpen(position),
      )
      if (holdsPresident && !presidentsCoverTerm(clubId, (position) => position.userId === membership.userId)) {
        return problem(422, `Đưa ${name} ra thì CLB không còn Chủ nhiệm đến hết nhiệm kỳ. ${lastPresidentHint(clubId)}`, 'LAST_PRESIDENT')
      }
    }

    const fromStatus = membership.status
    membership.status = rule.to
    if (approval && department) {
      openDepartmentStint(membership, department.id, vnToday(), user.value.id)
      membership.joinedOn = vnToday()
    }
    if (action === 'REJECT' || action === 'REMOVE') {
      membership.leftOn = vnToday()
      membership.exitKind = action === 'REJECT' ? 'REJECTED' : 'REMOVED'
      membership.leaveReason = reason
      closeDepartmentStint(membership, vnToday())
    }
    if (action === 'REMOVE') removeFromClub(membership, reason)
    // Ban chủ nhiệm xử lý tư cách trực tiếp thì yêu cầu tạm nghỉ đang chờ (nếu có) không còn cần duyệt (FR-MEM-07).
    if (action === 'PUT_ON_LEAVE') closePendingLeaveRequest(membership.id, 'APPROVED', user.value.id, reason)
    if (action === 'REMOVE') closePendingLeaveRequest(membership.id, 'CLOSED', user.value.id, 'Thành viên đã bị đưa ra khỏi CLB.')
    membership.history.push({ at: nowIso(), actorId: user.value.id, fromStatus, toStatus: rule.to, reason: reason || null })
    membership.version += 1
    notifyMembershipChange(membership, action, reason, user.value.id)
    return HttpResponse.json(toDetail(membership, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/department-transfers`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return forbidden(clubId, 'MANAGE_MEMBERS', 'chuyển ban chính của thành viên')
    const body = (await request.json()) as Partial<DepartmentTransferRequest>
    const raw: unknown[] = Array.isArray(body.members) ? body.members : []
    // Body JSON có thể chứa kiểu bất kỳ; dòng sai kiểu trả 400 ở đúng dòng thay vì lỗi máy chủ.
    const malformed = raw.flatMap((row, index) =>
      typeof row === 'object' && row !== null && typeof (row as { membershipId?: unknown }).membershipId === 'string' && typeof (row as { version?: unknown }).version === 'number'
        ? []
        : [{ field: `members[${index}]`, message: 'Mỗi dòng cần mã tư cách và version.' }],
    )
    if (malformed.length > 0) return problem(400, 'Thông tin chuyển ban chưa hợp lệ.', 'VALIDATION', malformed)
    const rows = raw as DepartmentTransferRequest['members']
    const target = db.departments.find((department) => department.id === body.toDepartmentId && department.clubId === clubId && department.status === 'ACTIVE')
    const shapeErrors = [
      ...(!target ? [{ field: 'toDepartmentId', message: 'Chọn một ban đang hoạt động của CLB.' }] : []),
      ...(rows.length === 0 || rows.length > TRANSFER_MAX ? [{ field: 'members', message: `Chọn từ 1 đến ${TRANSFER_MAX} người mỗi lần.` }] : []),
      ...(new Set(rows.map((row) => row.membershipId)).size !== rows.length ? [{ field: 'members', message: 'Mỗi người chỉ chọn một lần.' }] : []),
    ]
    if (!target || shapeErrors.length > 0) return problem(400, 'Thông tin chuyển ban chưa hợp lệ.', 'VALIDATION', shapeErrors)

    const found = rows.map((row) => db.memberships.find((candidate) => candidate.id === row.membershipId && candidate.clubId === clubId && wasMember(candidate)))
    if (found.some((membership) => membership === undefined)) return notFound()
    const memberships = found as DbMembership[]
    const indexed = memberships.map((membership, index) => ({ membership, index, name: personRef(membership.userId).fullName }))
    // Tất cả hoặc không ai: một người lỗi thì không ai được chuyển.
    const stale = indexed.filter(({ membership, index }) => rows[index]?.version !== membership.version)
    if (stale.length > 0) {
      return problem(409, `Thông tin của ${stale.map((row) => row.name).join(', ')} vừa được người khác cập nhật. Tải lại rồi chọn lại.`, 'VERSION_CONFLICT', stale.map(({ index }) => ({ field: `members[${index}]`, message: 'Dữ liệu đã thay đổi.' })))
    }
    const left = indexed.filter(({ membership }) => !TRANSFERABLE.includes(membership.status))
    if (left.length > 0) return problem(422, `${left.map((row) => row.name).join(', ')} đã rời CLB nên không chuyển ban được.`, 'INVALID_TRANSITION')
    // Trưởng ban, Phó ban phải thuộc đúng ban đó (BR-ORG-01), nên còn giữ chức của ban cũ thì phải thu hồi trước (chốt 15/11).
    const holding = indexed.flatMap(({ membership, name }) => openDepartmentPositionsOf(membership).map((position) => `${name} (${positionTitleOf(position)})`))
    if (holding.length > 0) {
      return problem(422, `Còn giữ chức vụ ở ban cũ: ${holding.join(', ')}. Thu hồi chức vụ ở trang Cơ cấu trước khi chuyển ban.`, 'HOLDS_DEPARTMENT_POSITION')
    }
    const already = indexed.filter(({ membership }) => membership.departmentId === target.id)
    if (already.length > 0) {
      return problem(400, 'Có người đã thuộc ban được chọn.', 'VALIDATION', already.map(({ index, name }) => ({ field: `members[${index}]`, message: `${name} đã thuộc ban ${target.name}.` })))
    }

    const today = vnToday()
    for (const membership of memberships) {
      transferDepartment(membership, target.id, user.value.id, today)
      membership.version += 1
    }
    notify(
      memberships.map((membership) => membership.userId),
      { clubId, category: 'MEMBERSHIP', title: `Ban chính của bạn ở ${clubOf(clubId)?.name ?? 'CLB'} chuyển sang Ban ${target.name}`, target: structureTarget(clubId), actorId: user.value.id },
    )
    const result: DepartmentTransferResult = { toDepartment: { id: target.id, name: target.name }, members: memberships.map((membership) => toSummary(membership, user.value.id)) }
    return HttpResponse.json(result)
  }),
]


import { http, HttpResponse } from 'msw'
import type {
  ClubAction,
  ClubDetail,
  ClubDirectoryEntry,
  ClubSettings,
  ClubSettingsValues,
  ClubStatus,
  ClubTransitionAction,
  ClubTransitionRequest,
  CreateClubRequest,
  UpdateClubRequest,
  UpdateClubSettingsRequest,
} from '@/features/club/model/clubTypes'
import { CLUB_SETTING_MESSAGES, inRange, NUMERIC_CLUB_SETTINGS, semesterErrors } from '@/shared/lib/clubSettingsRules'
import { isContactPhone, isEmail, normalizePhone, safeHttpUrl } from '@/shared/lib/contactRules'
import { imageContentType, validateImageFile } from '@/shared/lib/validateImageFile'
import { db, type DbClub, type DbMembership } from '../db'
import { announcementAudiences } from '../mockAnnouncements'
import { createGeneralFund, keepsLedger } from '../mockFinance'
import { publicClubInfo } from '../mockInvitations'
import { generalFundId } from '../seed/financeSeed'
import { defaultClubSettings } from '../seed/clubSeed'
import { blankMemberInfo } from '../seed/memberSeed'
import { API, currentUser, fileToDataUrl, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, isActiveMember, memberCountOf, membershipOf, myMembershipIn, personRef, recordMembershipChange } from '../mockMembers'
import { can, forbidden } from '../mockAccess'
import { currentTermOf, grantPosition, isBoardMember, isPresidency, positionTitlesOf } from '../mockPermissions'
import { assignableScopes } from '../mockScopes'
import { isEventGuest } from '../mockStaffEvents'
import { canAssignStanding, canCreateTerm } from '../mockTerms'
import { nowIso, vnToday } from '../mockTime'
import { canRequestTransfer } from '../mockTransfers'
import { reportDepartmentsOf } from '../mockClubReport'
import { workloadScopesOf } from '../mockWorkload'
import { audit } from '../mockAudit'
import { canManageRecruitment } from '../mockRecruitments'
import { clubStatusOf, lastStatusChangeOf } from '../mockClubStatus'
import { eventFundOf } from '../mockFinance'
import { clubTarget, notify } from '../mockNotifications'


function clubActionsFor(userId: string, clubId: string): ClubAction[] {
  const actions: ClubAction[] = []
  if (can(userId, clubId, 'CREATE_EVENT')) actions.push('CREATE_EVENT')
  if (can(userId, clubId, 'MANAGE_MEMBERS')) actions.push('MANAGE_MEMBERS', 'MANAGE_RECRUITMENT')
  if (can(userId, clubId, 'MANAGE_DEPARTMENTS')) actions.push('MANAGE_ORG')
  if (can(userId, clubId, 'CONFIGURE_CLUB')) actions.push('EDIT_CLUB')
  const assigns = can(userId, clubId, 'ASSIGN_POSITIONS')
  if (assigns && canAssignStanding(clubId)) actions.push('ASSIGN_POSITION')
  // Quy tắc chốt 05/11: chỉ Chủ nhiệm, Phó chủ nhiệm gán được hai chức này, bảng phân quyền không mở rộng được.
  if (assigns && isPresidency(userId, clubId)) actions.push('ASSIGN_PRESIDENCY')
  if (canCreateTerm(userId, clubId)) actions.push('CREATE_TERM')
  if (isActiveMember(userId, clubId)) actions.push('PROPOSE_EVENT')
  // Chỉ hiện nút giao việc khi thật sự có phạm vi để giao (BR-TASK-01); người tạm nghỉ không giữ chức vụ thường trực.
  const canAssign = membershipOf(userId, clubId)?.status !== 'ON_LEAVE' && assignableScopes(userId, clubId).length > 0
  if (canAssign) actions.push('ASSIGN_TASK')
  if (announcementAudiences(userId, clubId).length > 0) actions.push('SEND_ANNOUNCEMENT')
  if (canRequestTransfer(userId, clubId)) actions.push('REQUEST_PRESIDENCY_TRANSFER')
  if (isBoardMember(userId, clubId)) actions.push('VIEW_PERMISSIONS', 'VIEW_SHARED_EVENTS', 'VIEW_DUES', 'VIEW_FINANCE_REPORT')
  if (isBoardMember(userId, clubId) && keepsLedger(userId, clubId)) actions.push('OPEN_DUES')
  if (isBoardMember(userId, clubId)) actions.push('VIEW_CLUB_REPORT', 'VIEW_AUDIT_LOG', 'VIEW_HIDDEN_DOCUMENTS')
  if (reportDepartmentsOf(userId, clubId).length > 0) actions.push('VIEW_DEPARTMENT_REPORTS')
  if (workloadScopesOf(userId, clubId).length > 0) actions.push('VIEW_WORKLOAD')
  if (canManageRecruitment(userId, clubId)) actions.push('CREATE_RECRUITMENT')
  if (isBoardMember(userId, clubId)) actions.push('CHANGE_CLUB_STATUS')
  const status = clubStatusOf(clubId)
  // ST-CLB: tạm ngừng thì không tạo hoạt động mới; giải thể thì chỉ còn quyền xem.
  if (status === 'DISSOLVED') return actions.filter((action) => action.startsWith('VIEW_'))
  if (status === 'SUSPENDED') return actions.filter((action) => !NEW_ACTIVITY_ACTIONS.has(action))
  return actions
}

const NEW_ACTIVITY_ACTIONS = new Set<ClubAction>(['CREATE_EVENT', 'PROPOSE_EVENT', 'CREATE_RECRUITMENT'])

function toClubDetail(club: DbClub, viewerId: string): ClubDetail {
  const term = currentTermOf(club.id)
  return {
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    field: club.field,
    description: club.description,
    foundedOn: club.foundedOn,
    logoUrl: club.logoUrl,
    contactEmail: club.contactEmail,
    contactPhone: club.contactPhone,
    contactUrl: club.contactUrl,
    rules: club.rules,
    collectsStudentId: club.collectsStudentId,
    memberCount: memberCountOf(club.id),
    currentTermName: term?.name ?? '',
    currentTerm: term ? { id: term.id, name: term.name, startOn: term.startOn, endOn: term.endOn, status: term.status } : null,
    myPositionTitles: positionTitlesOf(viewerId, club.id),
    allowedActions: clubActionsFor(viewerId, club.id),
    generalFundId: generalFundId(club.id),
    viewerRole: 'MEMBER',
    status: club.status,
    lastStatusChange: lastStatusChangeOf(club),
    version: club.version,
  }
}

/** Khách của sự kiện chỉ nhận thông tin công khai của CLB chủ trì; không có nội quy, sĩ số, nhiệm kỳ, quỹ (SRS 3.5). */
function toGuestClubDetail(club: DbClub): ClubDetail {
  return {
    ...publicClubInfo(club),
    foundedOn: club.foundedOn,
    rules: '',
    memberCount: 0,
    currentTermName: '',
    currentTerm: null,
    myPositionTitles: [],
    allowedActions: [],
    generalFundId: '',
    viewerRole: 'EVENT_GUEST',
    status: club.status,
    lastStatusChange: null,
    version: club.version,
  }
}

const trimmed = (value: string | null | undefined) => (value ?? '').trim()
const orNull = (value: string) => (value === '' ? null : value)

/** Kiểm tra giống form web (FR-CLB-01, 02); `full` thêm liên hệ, nội quy khi sửa hồ sơ. */
function clubErrors(body: Partial<UpdateClubRequest>, full: boolean) {
  const name = trimmed(body.name)
  const shortName = trimmed(body.shortName)
  const field = trimmed(body.field)
  const description = trimmed(body.description)
  const contactEmail = trimmed(body.contactEmail)
  const contactPhone = normalizePhone(trimmed(body.contactPhone))
  const contactUrl = trimmed(body.contactUrl)
  const rules = trimmed(body.rules)
  const errors = [
    ...(name.length < 3 || name.length > 100 ? [{ field: 'name', message: 'Tên CLB cần từ 3 đến 100 ký tự.' }] : []),
    ...(shortName.length < 2 || shortName.length > 10 ? [{ field: 'shortName', message: 'Tên viết tắt cần 2–10 ký tự.' }] : []),
    ...(field.length < 2 || field.length > 50 ? [{ field: 'field', message: 'Lĩnh vực cần từ 2 đến 50 ký tự.' }] : []),
    ...(description.length < 10 || description.length > 1000 ? [{ field: 'description', message: 'Mô tả cần từ 10 đến 1000 ký tự.' }] : []),
  ]
  if (full) {
    errors.push(
      ...(contactEmail !== '' && !isEmail(contactEmail) ? [{ field: 'contactEmail', message: 'Email không hợp lệ.' }] : []),
      ...(contactPhone !== '' && !isContactPhone(contactPhone) ? [{ field: 'contactPhone', message: 'Số điện thoại gồm 10–11 chữ số, bắt đầu bằng 0.' }] : []),
      ...(contactUrl.length > 200
        ? [{ field: 'contactUrl', message: 'Liên kết tối đa 200 ký tự.' }]
        : contactUrl !== '' && safeHttpUrl(contactUrl) === null
          ? [{ field: 'contactUrl', message: 'Liên kết phải bắt đầu bằng http:// hoặc https://.' }]
          : []),
      ...(rules.length > 5000 ? [{ field: 'rules', message: 'Nội quy tối đa 5000 ký tự.' }] : []),
    )
  }
  return { name, shortName, field, description, contactEmail: orNull(contactEmail), contactPhone: orNull(contactPhone), contactUrl: orNull(contactUrl), rules, errors }
}

/** Nhiệm kỳ đầu dài 12 tháng: hết ngày trước ngày cùng tên năm sau (29/02 thì hết 28/02). */
export function firstTermEnd(startOn: string): string {
  const [year = 0, month = 1, day = 1] = startOn.split('-').map(Number)
  const end = new Date(Date.UTC(year + 1, month - 1, day))
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

/** Ghi được hồ sơ CLB: người gọi là thành viên và có quyền cấu hình CLB theo bảng phân quyền (FR-CLB-02). */
function editableClub(userId: string, clubId: string, what = 'sửa hồ sơ CLB'): { ok: true; club: DbClub } | { ok: false; response: Response } {
  const club = db.clubs.find((candidate) => candidate.id === clubId)
  if (!club) return { ok: false, response: problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND') }
  if (!canAccessClub(userId, clubId)) return { ok: false, response: problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER') }
  if (!can(userId, clubId, 'CONFIGURE_CLUB')) return { ok: false, response: forbidden(clubId, 'CONFIGURE_CLUB', what) }
  return { ok: true, club }
}

/** ST-CLB: trạng thái đích của từng thao tác theo trạng thái hiện tại. */
const CLUB_TRANSITIONS: Record<ClubStatus, Partial<Record<ClubTransitionAction, ClubStatus>>> = {
  ACTIVE: { SUSPEND: 'SUSPENDED', DISSOLVE: 'DISSOLVED' },
  SUSPENDED: { REACTIVATE: 'ACTIVE', DISSOLVE: 'DISSOLVED' },
  DISSOLVED: {},
}
const TRANSITION_ACTIONS: ClubTransitionAction[] = ['SUSPEND', 'REACTIVATE', 'DISSOLVE']
const STATUS_REASON_MIN = 5
const STATUS_REASON_MAX = 500

/** Sự kiện chặn giải thể: chưa Đã đóng, hoặc Đã hủy mà quỹ sự kiện chưa quyết toán. */
export function openEventsOf(clubId: string): Array<{ id: string; name: string }> {
  return db.events
    .filter((event) => event.clubId === clubId)
    .filter((event) => {
      if (event.status === 'CLOSED') return false
      if (event.status !== 'CANCELLED') return true
      const fund = eventFundOf(event.id)
      return fund !== undefined && fund.status !== 'SETTLED'
    })
    .map((event) => ({ id: event.id, name: event.name }))
}

const transitionNotice: Record<ClubTransitionAction, (club: DbClub) => string> = {
  SUSPEND: (club) => `${club.name} tạm ngừng hoạt động`,
  REACTIVATE: (club) => `${club.name} hoạt động trở lại`,
  DISSOLVE: (club) => `${club.name} đã giải thể`,
}

/** Giải thể: yêu cầu gia nhập đang chờ bị từ chối vì CLB không còn nhận thành viên. */
function rejectPendingJoinRequests(clubId: string, actorId: string) {
  const reason = 'CLB đã giải thể.'
  for (const membership of db.memberships.filter((candidate) => candidate.clubId === clubId && candidate.status === 'PENDING')) {
    Object.assign(membership, { status: 'LEFT', leftOn: vnToday(), exitKind: 'REJECTED', leaveReason: reason, version: membership.version + 1 })
    recordMembershipChange(membership, { actorId, fromStatus: 'PENDING', toStatus: 'LEFT', reason })
  }
}

/** Các tham số sửa được, cùng thứ tự với form. */
const SETTING_KEYS = [
  'probationStep',
  'inviteLinkDays',
  'registrationCancelHours',
  'rescheduleConfirmHours',
  'attendanceLeadMinutes',
  'attendanceQrRotateSeconds',
  'attendanceEditHours',
  'taskReminderDays',
  'expenseReceiptThreshold',
  'advanceSettleDays',
  'semester1Start',
  'semester2Start',
  'summerStart',
] as const satisfies ReadonlyArray<keyof ClubSettingsValues>

function toClubSettings(club: DbClub): ClubSettings {
  return {
    probationStep: club.probationStep,
    inviteLinkDays: club.inviteLinkDays,
    registrationCancelHours: club.registrationCancelHours,
    rescheduleConfirmHours: club.rescheduleConfirmHours,
    attendanceLeadMinutes: club.attendanceLeadMinutes,
    attendanceQrRotateSeconds: club.attendanceQrRotateSeconds,
    attendanceEditHours: club.attendanceEditHours,
    taskReminderDays: club.taskReminderDays,
    expenseReceiptThreshold: club.expenseReceiptThreshold,
    advanceSettleDays: club.advanceSettleDays,
    semester1Start: club.semester1Start,
    semester2Start: club.semester2Start,
    summerStart: club.summerStart,
    updatedAt: club.settingsUpdatedAt,
    updatedBy: club.settingsUpdatedBy ? personRef(club.settingsUpdatedBy) : null,
    version: club.settingsVersion,
  }
}

/** FR-CLB-03: kiểm từng tham số, trả lỗi theo ô; số phải là số nguyên trong khoảng cho phép, mốc học kỳ theo vòng năm. */
function settingsErrors(body: Partial<UpdateClubSettingsRequest>) {
  return [
    ...(typeof body.probationStep !== 'boolean' ? [{ field: 'probationStep', message: 'Chọn bật hoặc tắt bước thử việc.' }] : []),
    ...NUMERIC_CLUB_SETTINGS.flatMap((setting) => (inRange(setting, body[setting]) ? [] : [{ field: setting, message: CLUB_SETTING_MESSAGES[setting] }])),
    ...semesterErrors({ semester1Start: body.semester1Start, semester2Start: body.semester2Start, summerStart: body.summerStart === undefined ? '' : body.summerStart }),
  ]
}

export const clubHandlers = [
  http.get(`${API}/clubs/:clubId/settings`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const club = db.clubs.find((candidate) => candidate.id === clubId)
    if (!club) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
    if (!canAccessClub(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    if (!can(user.value.id, clubId, 'CONFIGURE_CLUB')) return forbidden(clubId, 'CONFIGURE_CLUB', 'xem và sửa tham số CLB')
    return HttpResponse.json(toClubSettings(club))
  }),

  http.patch(`${API}/clubs/:clubId/settings`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const target = editableClub(user.value.id, String(params.clubId), 'sửa tham số CLB')
    if (!target.ok) return target.response
    const club = target.club
    const body = (await request.json()) as Partial<UpdateClubSettingsRequest>
    if (body.version !== club.settingsVersion) {
      return problem(409, 'Tham số CLB vừa được người khác sửa. Tải lại để xem giá trị mới nhất.', 'VERSION_CONFLICT')
    }
    const errors = settingsErrors(body)
    if (errors.length > 0) return problem(400, 'Tham số CLB chưa hợp lệ.', 'VALIDATION', errors)
    const next = Object.fromEntries(SETTING_KEYS.map((key) => [key, body[key]])) as Pick<DbClub, (typeof SETTING_KEYS)[number]>
    const changed = SETTING_KEYS.some((key) => club[key] !== next[key])
    if (!changed) return HttpResponse.json(toClubSettings(club))
    // Giá trị mới chỉ dùng cho thao tác từ nay về sau: khoản chi đã duyệt, lời mời đã tạo, buổi đã chốt không bị tính lại (FR-CLB-03).
    Object.assign(club, next, { settingsVersion: club.settingsVersion + 1, settingsUpdatedAt: nowIso(), settingsUpdatedBy: user.value.id })
    return HttpResponse.json(toClubSettings(club))
  }),

  http.get(`${API}/clubs`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const url = new URL(request.url)
    const keyword = url.searchParams.get('q')
    const rows: ClubDirectoryEntry[] = db.clubs
      .filter((club) => club.status !== 'DISSOLVED' || membershipOf(user.value.id, club.id) !== undefined)
      .filter((club) => matchesKeyword(`${club.name} ${club.shortName} ${club.field}`, keyword))
      .toSorted((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((club) => ({
        ...publicClubInfo(club),
        myMembership: myMembershipIn(user.value.id, club.id),
        // BR-MEM-01: chỉ gửi được khi chưa có tư cách đang hoạt động ở CLB đó.
        allowedActions: membershipOf(user.value.id, club.id) || club.status === 'DISSOLVED' ? [] : ['REQUEST_TO_JOIN'],
      }))
    return HttpResponse.json(paginate(rows, url, 12))
  }),

  http.post(`${API}/clubs`, async ({ request }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const body = (await request.json()) as Partial<CreateClubRequest>
    const { name, shortName, field, description, errors } = clubErrors(body, false)
    if (errors.length > 0) return problem(400, 'Thông tin CLB chưa hợp lệ.', 'VALIDATION', errors)
    const today = vnToday()
    const now = nowIso()
    // FR-CLB-01: một lần ghi tạo CLB, Quỹ chung, nhiệm kỳ đầu Đang chạy, tư cách Chính thức và chức Chủ nhiệm cho người tạo.
    const club: DbClub = {
      id: newId('c'),
      name,
      shortName,
      field,
      description,
      foundedOn: today,
      logoUrl: null,
      contactEmail: null,
      contactPhone: null,
      contactUrl: null,
      rules: '',
      status: 'ACTIVE',
      statusHistory: [],
      collectsStudentId: false,
      ...defaultClubSettings(),
      version: 1,
    }
    db.clubs.push(club)
    createGeneralFund(club.id)
    db.terms.push({
      id: newId('t'),
      clubId: club.id,
      name: 'Nhiệm kỳ đầu tiên',
      startOn: today,
      endOn: firstTermEnd(today),
      status: 'RUNNING',
      createdAt: now,
      createdBy: user.value.id,
      closedAt: null,
      departmentPlan: null,
      closedDepartments: null,
      extensions: [],
      version: 1,
    })
    const membership: DbMembership = {
      id: newId('m'),
      userId: user.value.id,
      clubId: club.id,
      status: 'ACTIVE',
      departmentId: null,
      departmentHistory: [],
      requestedAt: now,
      joinedOn: today,
      leftOn: null,
      exitKind: null,
      leaveReason: null,
      introduction: null,
      studentId: null,
      ...blankMemberInfo(),
      history: [],
      version: 1,
    }
    db.memberships.push(membership)
    recordMembershipChange(membership, { actorId: user.value.id, fromStatus: null, toStatus: 'ACTIVE', reason: null, at: now })
    grantPosition({ userId: user.value.id, clubId: club.id, role: 'PRESIDENT', scopeId: club.id, assignedBy: user.value.id })
    return HttpResponse.json(toClubDetail(club, user.value.id), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const club = db.clubs.find((candidate) => candidate.id === params.clubId)
    if (!club) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
    if (!canAccessClub(user.value.id, club.id)) {
      if (isEventGuest(user.value.id, club.id)) return HttpResponse.json(toGuestClubDetail(club))
      if (membershipOf(user.value.id, club.id)?.status === 'PENDING') {
        return problem(403, 'Yêu cầu gia nhập của bạn đang chờ ban chủ nhiệm duyệt.', 'MEMBERSHIP_PENDING')
      }
      return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    }
    return HttpResponse.json(toClubDetail(club, user.value.id))
  }),

  http.patch(`${API}/clubs/:clubId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const target = editableClub(user.value.id, String(params.clubId))
    if (!target.ok) return target.response
    const body = (await request.json()) as Partial<UpdateClubRequest>
    if (body.version !== target.club.version) {
      return problem(409, 'Hồ sơ CLB vừa được người khác sửa. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
    }
    const { errors, ...fields } = clubErrors(body, true)
    if (errors.length > 0) return problem(400, 'Hồ sơ CLB chưa hợp lệ.', 'VALIDATION', errors)
    Object.assign(target.club, { ...fields, collectsStudentId: body.collectsStudentId === true, version: target.club.version + 1 })
    return HttpResponse.json(toClubDetail(target.club, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const club = db.clubs.find((candidate) => candidate.id === clubId)
    if (!club) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
    if (!canAccessClub(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm đổi được trạng thái CLB.', 'FORBIDDEN')
    const body = (await request.json()) as Partial<ClubTransitionRequest>
    if (body.version !== club.version) return problem(409, 'CLB vừa được người khác cập nhật. Tải lại rồi thử lại.', 'VERSION_CONFLICT')
    const action = TRANSITION_ACTIONS.find((candidate) => candidate === body.action)
    const target = action ? CLUB_TRANSITIONS[club.status][action] : undefined
    if (action && !target) return problem(422, 'CLB đang ở trạng thái không cho phép thao tác này.', 'INVALID_TRANSITION')
    if (action === 'DISSOLVE') {
      const open = openEventsOf(clubId)
      if (open.length > 0) {
        const names = open.map((event) => event.name).join(', ')
        return problem(422, `Còn ${open.length} sự kiện chưa đóng nên chưa giải thể được CLB: ${names}.`, 'CLUB_HAS_OPEN_EVENTS')
      }
    }
    const reason = (body.reason ?? '').trim()
    const errors = [
      ...(!action ? [{ field: 'action', message: 'Chọn thao tác.' }] : []),
      ...(reason.length < STATUS_REASON_MIN || reason.length > STATUS_REASON_MAX ? [{ field: 'reason', message: `Lý do cần từ ${STATUS_REASON_MIN} đến ${STATUS_REASON_MAX} ký tự.` }] : []),
    ]
    if (!action || !target || errors.length > 0) return problem(400, 'Thông tin chưa hợp lệ.', 'VALIDATION', errors)
    const from = club.status
    const at = nowIso()
    club.statusHistory.push({ from, to: target, at, by: user.value.id, reason })
    club.status = target
    club.version += 1
    if (target === 'DISSOLVED') rejectPendingJoinRequests(clubId, user.value.id)
    audit({ at, actorId: user.value.id, clubId, action: 'CHANGE_CLUB_STATUS', objectType: 'CLUB', objectId: clubId, objectLabel: club.name, before: { status: from }, after: { status: target }, reason })
    const members = db.memberships.filter((membership) => membership.clubId === clubId && membership.status !== 'LEFT' && membership.status !== 'PENDING')
    notify(
      members.map((membership) => membership.userId),
      { clubId, category: 'MEMBERSHIP', title: transitionNotice[action](club), body: `Lý do: ${reason}`, target: clubTarget(clubId), actorId: user.value.id },
    )
    return HttpResponse.json(toClubDetail(club, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/logo`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const target = editableClub(user.value.id, String(params.clubId))
    if (!target.ok) return target.response
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return problem(400, 'Thiếu tệp logo.', 'VALIDATION')
    const invalid = validateImageFile(file, 'Logo CLB')
    if (invalid) return problem(400, invalid, 'INVALID_FILE')
    Object.assign(target.club, { logoUrl: await fileToDataUrl(file, imageContentType(file.name) ?? file.type), version: target.club.version + 1 })
    return HttpResponse.json(toClubDetail(target.club, user.value.id))
  }),
]

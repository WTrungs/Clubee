import { http, HttpResponse } from 'msw'
import { formatDateTime, formatTimeRange } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import type {
  CreateEventRequest,
  CreateSubcommitteeRequest,
  EventAction,
  EventDetail,
  EventStatus,
  EventSummary,
  EventTransitionAction,
  EventTransitionRequest,
  MyRegistration,
  Registration,
  RescheduleEventRequest,
  ScheduleChange,
  StaffCandidate,
  Subcommittee,
} from '@/features/event/model/eventTypes'
import { db } from '../db'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, departmentNameOf, eligibleMembers, isActiveMember, membershipOf, personRef as person } from '../mockMembers'
import { normalizeEmail } from '../mockInvitations'
import { isEmail } from '@/shared/lib/contactRules'
import { eventAttendanceAvailable } from '../mockAttendance'
import { canViewFund, ensureEventFund, eventFundOf } from '../mockFinance'
import {
  activeRegistrations,
  cancelDeadlineOf,
  holdsSeat,
  promoteWaitlist,
  registrationsEditable,
  requireReconfirmation,
  seatsTaken,
  toMyRegistration,
  waitlistPosition,
} from '../mockRegistrations'
import { EVENT_STAFF_ACTIVE as STAFF_ACTIVE, endPositions, grantPosition, isBoardMember, positionHolderOf } from '../mockPermissions'
import { can, forbidden } from '../mockAccess'
import { eventTarget, notify } from '../mockNotifications'
import { assignSubcommitteeLead, isEventGuest, isEventLead, isEventStaff, leadsOtherSubcommittee } from '../mockStaffEvents'
import { isBoardAppointee, openHandoverOf } from '../mockTerms'
import { nowIso } from '../mockTime'
import type { DbEvent, DbRegistration, DbScheduleChange, DbSubcommittee } from '../seed/eventSeed'

const CANCELLABLE: EventStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REGISTRATION_OPEN']
const URL_PATTERN = /^https?:\/\/\S+$/

const statusLabel: Record<EventStatus, string> = {
  DRAFT: 'Dự thảo',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REGISTRATION_OPEN: 'Mở đăng ký',
  ONGOING: 'Đang diễn ra',
  ENDED: 'Đã kết thúc',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
}

/** Sự kiện đã hủy hoặc đã đóng vẫn hiện người từng giữ chức để tra lịch sử. */
const historyOnly = (event: DbEvent) => ({ includeEnded: !STAFF_ACTIVE.includes(event.status) })

function canViewEvent(userId: string, event: DbEvent): boolean {
  // Người ngoài CLB chỉ xem qua tư cách CTV hoặc nhân sự CLB đồng tổ chức; thành viên đã rời thì mất quyền (BR-MEM-04).
  if (!canAccessClub(userId, event.clubId)) return isEventStaff(userId, event, { outsideOnly: true })
  // Ban chủ nhiệm vẫn xem được đề xuất mình đã từ chối (FR-EVT-03: về Dự thảo kèm lý do).
  if (event.status === 'DRAFT') return event.proposerId === userId || (event.rejectionReason !== null && isBoardMember(userId, event.clubId))
  if (event.status === 'PENDING_APPROVAL') return event.proposerId === userId || isBoardMember(userId, event.clubId)
  return true
}

function registrationOpen(event: DbEvent): boolean {
  return event.status === 'REGISTRATION_OPEN' && (!event.registrationDeadline || Date.parse(event.registrationDeadline) > Date.now())
}

function myRegistration(userId: string, event: DbEvent): MyRegistration | null {
  const registration = activeRegistrations(event.id).find((candidate) => candidate.userId === userId)
  return registration ? toMyRegistration(event, registration) : null
}

const eventScope = (event: DbEvent) => ({ type: 'EVENT', id: event.id }) as const

/** BR-EVT-05: quỹ sự kiện đã quyết toán; chưa có tạm ứng (FR-FIN-07, P1) nên điều kiện tạm ứng mở luôn đúng. */
const fundSettled = (event: DbEvent) => eventFundOf(event.id)?.status === 'SETTLED'
const closable = (event: DbEvent) => event.status === 'ENDED' && fundSettled(event)

function eventActions(userId: string, event: DbEvent): EventAction[] {
  const board = isBoardMember(userId, event.clubId)
  const lead = isEventLead(userId, event)
  const runs = can(userId, event.clubId, 'RUN_EVENT', eventScope(event))
  const actions: EventAction[] = []
  if (event.status === 'DRAFT' && event.proposerId === userId) actions.push('SUBMIT')
  if (event.status === 'PENDING_APPROVAL' && can(userId, event.clubId, 'APPROVE_EVENT')) actions.push('APPROVE', 'REJECT')
  if (event.status === 'APPROVED' && runs) actions.push('OPEN_REGISTRATION')
  if (registrationsEditable(event) && runs) actions.push('RESCHEDULE')
  if (CANCELLABLE.includes(event.status) && can(userId, event.clubId, 'CREATE_EVENT')) actions.push('CANCEL')
  if (closable(event) && runs) actions.push('CLOSE')
  if (STAFF_ACTIVE.includes(event.status) && can(userId, event.clubId, 'MANAGE_EVENT_STAFF', eventScope(event))) actions.push('MANAGE_SUBCOMMITTEES')
  if (registrationOpen(event) && isActiveMember(userId, event.clubId) && !myRegistration(userId, event)) actions.push('REGISTER')
  if (board || lead || isEventStaff(userId, event)) actions.push('VIEW_STAFF', 'VIEW_REGISTRATIONS')
  const fund = eventFundOf(event.id)
  if (fund && canViewFund(userId, fund)) actions.push('VIEW_FUND')
  // Điểm danh sự kiện: ban chủ nhiệm và nhân sự BTC; sự kiện Đã đóng thì chỉ ban chủ nhiệm còn xem (FR-ATT-07).
  if (eventAttendanceAvailable(event) && (board || lead || isEventStaff(userId, event))) actions.push('VIEW_ATTENDANCE')
  return actions
}

function toSummary(event: DbEvent, userId: string): EventSummary {
  const registrations = activeRegistrations(event.id)
  const leadId = positionHolderOf('EVENT_LEAD', event.id, historyOnly(event))
  return {
    id: event.id,
    clubId: event.clubId,
    name: event.name,
    startAt: event.startAt,
    endAt: event.endAt,
    format: event.format,
    location: event.location,
    capacity: event.capacity,
    confirmedCount: registrations.filter(holdsSeat).length,
    waitlistCount: registrations.filter((registration) => registration.status === 'WAITLISTED').length,
    registrationDeadline: event.registrationDeadline,
    openToGuests: event.openToGuests,
    status: event.status,
    lead: leadId ? person(leadId) : null,
    myRegistration: myRegistration(userId, event),
  }
}

function toDetail(event: DbEvent, userId: string): EventDetail {
  const fund = eventFundOf(event.id)
  return {
    ...toSummary(event, userId),
    description: event.description,
    onlineUrl: event.onlineUrl,
    proposer: person(event.proposerId),
    approver: event.approverId ? person(event.approverId) : null,
    rejectionReason: event.rejectionReason,
    cancellationReason: event.cancellationReason,
    allowedActions: eventActions(userId, event),
    version: event.version,
    createdAt: event.createdAt,
    statusBeforeCancel: event.statusBeforeCancel,
    fundId: fund?.id ?? null,
    fundStatus: fund && canViewFund(userId, fund) ? fund.status : null,
    lastScheduleChange: toScheduleChange(event.scheduleChanges.at(-1)),
  }
}

function toScheduleChange(change: DbScheduleChange | undefined): ScheduleChange | null {
  if (!change) return null
  const { actorId, actorName, ...rest } = change
  return { ...rest, actor: { id: actorId, fullName: actorName } }
}

function toSubcommittee(subcommittee: DbSubcommittee, event: DbEvent, userId: string): Subcommittee {
  const staff = db.eventStaff
    .filter((member) => member.subcommitteeId === subcommittee.id && member.leftAt === null)
    .map((member) => ({ ...person(member.userId), departmentName: departmentNameOf(member.userId, event.clubId), kind: member.kind }))
  const leadId = positionHolderOf('SUBCOMMITTEE_LEAD', subcommittee.id, historyOnly(event))
  const active = STAFF_ACTIVE.includes(event.status)
  const canInvite = active && can(userId, event.clubId, 'MANAGE_EVENT_STAFF', { type: 'SUBCOMMITTEE', id: subcommittee.id })
  // Thêm CTV cần quyền ở cả sự kiện, nên trưởng tiểu ban không thêm được (FR-EVT-07).
  const canAddCollaborator = active && can(userId, event.clubId, 'MANAGE_EVENT_STAFF', eventScope(event))
  return {
    id: subcommittee.id,
    name: subcommittee.name,
    description: subcommittee.description,
    quota: subcommittee.quota,
    lead: staff.find((member) => member.id === leadId) ?? null,
    members: staff.filter((member) => member.id !== leadId),
    allowedActions: [...(canInvite ? (['INVITE_MEMBER'] as const) : []), ...(canAddCollaborator ? (['ADD_COLLABORATOR'] as const) : [])],
  }
}

/** Ứng viên BTC, Trưởng BTC: thành viên Thử việc hoặc Chính thức của CLB chủ trì (BR-ORG-01); chỉ tên và ban (FR-EVT-05). */
function memberCandidates(clubId: string, keyword: string | null): StaffCandidate[] {
  return eligibleMembers(clubId, { keyword })
}

function findEvent(params: Record<string, string | readonly string[] | undefined>) {
  return db.events.find((event) => event.id === params.eventId && event.clubId === params.clubId)
}

/** Chức vụ sự kiện hết hiệu lực khi sự kiện Đã hủy hoặc Đã đóng; bản ghi giữ lại (BR-ORG-03, BR-DATA-01). */
function endEventPositions(eventId: string, reason: string) {
  const subcommitteeIds = db.subcommittees.filter((subcommittee) => subcommittee.eventId === eventId).map((subcommittee) => subcommittee.id)
  endPositions((position) => position.scopeId === eventId || subcommitteeIds.includes(position.scopeId), { reason })
}

/** FR-NOT-02: báo người được giao vai trò trong ban tổ chức sự kiện. */
function notifyEventRole(userId: string, event: DbEvent, title: string, actorId: string) {
  notify([userId], { clubId: event.clubId, category: 'EVENT', title: `${title} ${event.name}`, target: eventTarget(event.clubId, event.id), actorId })
}

/** Nhân sự BTC đang hoạt động và Trưởng BTC. */
function organizerIds(event: DbEvent): string[] {
  return [...db.eventStaff.filter((staff) => staff.eventId === event.id && staff.leftAt === null).map((staff) => staff.userId), positionHolderOf('EVENT_LEAD', event.id) ?? '']
}

/** Người cần biết sự kiện bị hủy: người đăng ký còn hiệu lực, nhân sự BTC, Trưởng BTC (FR-EVT-15); lấy trước khi chức vụ hết hiệu lực. */
function cancellationRecipients(event: DbEvent): string[] {
  return [...activeRegistrations(event.id).map((registration) => registration.userId), ...organizerIds(event)]
}

const RESCHEDULABLE: EventStatus[] = ['APPROVED', 'REGISTRATION_OPEN']
const reasonOk = (reason: string) => reason.length >= REASON_MIN && reason.length <= REASON_MAX

/** Kiểm giờ mới khi dời (FR-EVT-14); hạn đăng ký không gửi thì giữ hạn cũ nên vẫn phải kiểm với giờ bắt đầu mới. */
function rescheduleErrors(event: DbEvent, body: Partial<RescheduleEventRequest>, deadline: string | null, reason: string) {
  const startAt = Date.parse(body.startAt ?? '')
  const endAt = Date.parse(body.endAt ?? '')
  const deadlineAt = deadline === null ? null : Date.parse(deadline)
  const unchanged = startAt === Date.parse(event.startAt) && endAt === Date.parse(event.endAt)
  return [
    ...(Number.isNaN(startAt) ? [{ field: 'startAt', message: 'Thời gian bắt đầu không hợp lệ.' }] : []),
    ...(startAt <= Date.now() ? [{ field: 'startAt', message: 'Giờ bắt đầu mới phải sau thời điểm hiện tại.' }] : []),
    ...(unchanged ? [{ field: 'startAt', message: 'Thời gian mới trùng thời gian hiện tại.' }] : []),
    ...(Number.isNaN(endAt) || endAt <= startAt ? [{ field: 'endAt', message: 'Kết thúc phải sau bắt đầu.' }] : []),
    ...(deadlineAt !== null && (Number.isNaN(deadlineAt) || deadlineAt > startAt) ? [{ field: 'registrationDeadline', message: 'Hạn đăng ký không được sau giờ bắt đầu mới.' }] : []),
    ...(!reasonOk(reason) ? [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }] : []),
  ]
}

/** Báo người đăng ký và BTC giờ cũ, giờ mới, lý do; người giữ chỗ được nêu hạn xác nhận (FR-EVT-14, FR-NOT-02). */
function notifyReschedule(event: DbEvent, change: DbScheduleChange, seated: DbRegistration[], deadline: string) {
  const base = { clubId: event.clubId, category: 'EVENT' as const, title: `Sự kiện dời thời gian: ${event.name}`, target: eventTarget(event.clubId, event.id), actorId: change.actorId }
  // Lý do đặt cuối vì người dùng có thể đã tự kết thúc câu bằng dấu chấm.
  const body = (note: string) => `Từ ${formatTimeRange(change.fromStartAt, change.fromEndAt)} sang ${formatTimeRange(change.toStartAt, change.toEndAt)}. ${note}Lý do: ${change.reason}`
  const seatedIds = seated.map((registration) => registration.userId)
  const waitingIds = activeRegistrations(event.id).filter((registration) => registration.status === 'WAITLISTED').map((registration) => registration.userId)
  notify(seatedIds, { ...base, body: body(`Hãy xác nhận tham dự trước ${formatDateTime(deadline)}, quá hạn thì đăng ký bị hủy. `) })
  notify(waitingIds, { ...base, body: body('Bạn vẫn giữ thứ tự trong danh sách chờ. ') })
  // Người vừa là BTC vừa đăng ký đã nhận tin ở trên.
  const organizers = organizerIds(event).filter((userId) => !seatedIds.includes(userId) && !waitingIds.includes(userId))
  notify(organizers, { ...base, body: body(seated.length > 0 ? `${seated.length} người giữ chỗ cần xác nhận lại trước ${formatDateTime(deadline)}. ` : '') })
}

function sortForList(events: DbEvent[]): DbEvent[] {
  const now = Date.now()
  const upcoming = events.filter((event) => Date.parse(event.endAt) >= now).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const past = events.filter((event) => Date.parse(event.endAt) < now).sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
  return [...upcoming, ...past]
}

export const eventHandlers = [
  http.get(`${API}/clubs/:clubId/events`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    // Khách của sự kiện chỉ thấy các sự kiện mình đang làm BTC (`canViewEvent`).
    if (!canAccessClub(user.value.id, clubId) && !isEventGuest(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    const url = new URL(request.url)
    const statuses = url.searchParams.getAll('status')
    const keyword = url.searchParams.get('q')
    const visible = db.events
      .filter((event) => event.clubId === clubId && canViewEvent(user.value.id, event))
      .filter((event) => statuses.length === 0 || statuses.includes(event.status))
      .filter((event) => matchesKeyword(`${event.name} ${event.location ?? ''}`, keyword))
    const page = paginate(sortForList(visible), url, 12)
    return HttpResponse.json({ ...page, content: page.content.map((event) => toSummary(event, user.value.id)) })
  }),

  http.get(`${API}/clubs/:clubId/event-lead-candidates`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const handover = openHandoverOf(clubId)
    const appointee = handover !== undefined && isBoardAppointee(user.value.id, handover)
    const appoints = can(user.value.id, clubId, 'CREATE_EVENT') || can(user.value.id, clubId, 'APPROVE_EVENT')
    if (!appoints && !appointee) return problem(403, 'Chỉ ban chủ nhiệm được chỉ định Trưởng BTC.', 'FORBIDDEN')
    return HttpResponse.json(memberCandidates(clubId, null))
  }),

  http.post(`${API}/clubs/:clubId/events`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    // Người có quyền tạo sự kiện thì sự kiện được duyệt ngay; người khác chỉ gửi đề xuất (FR-EVT-01, 02).
    const creates = can(user.value.id, clubId, 'CREATE_EVENT')
    if (!creates && !isActiveMember(user.value.id, clubId)) return problem(403, 'Chỉ thành viên của CLB được đề xuất sự kiện.', 'FORBIDDEN')
    const body = (await request.json()) as Partial<CreateEventRequest>
    const name = (body.name ?? '').trim()
    const startAt = Date.parse(body.startAt ?? '')
    const endAt = Date.parse(body.endAt ?? '')
    const deadline = body.registrationDeadline ? Date.parse(body.registrationDeadline) : null
    const leadOk = !creates || (body.leadUserId && memberCandidates(clubId, null).some((candidate) => candidate.id === body.leadUserId))
    const errors = [
      ...(name.length < 3 ? [{ field: 'name', message: 'Tên sự kiện cần ít nhất 3 ký tự.' }] : []),
      ...(Number.isNaN(startAt) ? [{ field: 'startAt', message: 'Thời gian bắt đầu không hợp lệ.' }] : []),
      ...(Number.isNaN(endAt) || endAt <= startAt ? [{ field: 'endAt', message: 'Kết thúc phải sau bắt đầu.' }] : []),
      ...(body.capacity !== null && body.capacity !== undefined && (!Number.isInteger(body.capacity) || body.capacity <= 0)
        ? [{ field: 'capacity', message: 'Số chỗ là số nguyên dương hoặc để trống.' }]
        : []),
      ...(deadline !== null && (Number.isNaN(deadline) || deadline > startAt) ? [{ field: 'registrationDeadline', message: 'Hạn đăng ký phải trước giờ bắt đầu.' }] : []),
      ...(body.format === 'ONLINE' && !URL_PATTERN.test(body.onlineUrl ?? '') ? [{ field: 'onlineUrl', message: 'Nhập liên kết bắt đầu bằng http:// hoặc https://.' }] : []),
      ...(body.format !== 'ONLINE' && !(body.location ?? '').trim() ? [{ field: 'location', message: 'Nhập địa điểm tổ chức.' }] : []),
      ...(!leadOk ? [{ field: 'leadUserId', message: 'Trưởng BTC phải là thành viên Thử việc hoặc Chính thức của CLB.' }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin sự kiện chưa hợp lệ.', 'VALIDATION', errors)
    const createdAt = nowIso()
    const event: DbEvent = {
      id: newId('e'),
      clubId,
      name,
      description: (body.description ?? '').trim(),
      startAt: body.startAt as string,
      endAt: body.endAt as string,
      format: body.format === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      location: body.format === 'ONLINE' ? null : (body.location ?? '').trim(),
      onlineUrl: body.format === 'ONLINE' ? (body.onlineUrl ?? null) : null,
      capacity: body.capacity ?? null,
      registrationDeadline: body.registrationDeadline ?? null,
      openToGuests: Boolean(body.openToGuests),
      status: creates ? 'APPROVED' : 'DRAFT',
      statusBeforeCancel: null,
      proposerId: user.value.id,
      approverId: creates ? user.value.id : null,
      rejectionReason: null,
      cancellationReason: null,
      scheduleChanges: [],
      createdAt,
      version: 1,
    }
    db.events.push(event)
    if (creates) ensureEventFund(event.id, clubId)
    if (creates && body.leadUserId) {
      grantPosition({ userId: body.leadUserId, clubId, role: 'EVENT_LEAD', scopeId: event.id, assignedBy: user.value.id })
      notifyEventRole(body.leadUserId, event, 'Bạn được chọn làm Trưởng BTC', user.value.id)
    }
    return HttpResponse.json(toDetail(event, user.value.id), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/events/:eventId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    return HttpResponse.json(toDetail(event, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    const body = (await request.json()) as Partial<EventTransitionRequest>
    const action = body.action as EventTransitionAction | undefined
    if (body.version !== event.version) {
      return problem(409, 'Sự kiện vừa được người khác cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    }
    const clubId = event.clubId
    const runs = can(user.value.id, clubId, 'RUN_EVENT', eventScope(event))
    const reason = (body.reason ?? '').trim()
    const invalid = () => problem(422, `Không thể thực hiện khi sự kiện đang ở trạng thái ${statusLabel[event.status]}.`, 'INVALID_TRANSITION')
    const needReason = () => problem(400, 'Vui lòng nhập lý do.', 'VALIDATION', [{ field: 'reason', message: 'Nhập ít nhất 5 ký tự.' }])

    switch (action) {
      case 'SUBMIT':
        if (event.status !== 'DRAFT') return invalid()
        if (event.proposerId !== user.value.id) return problem(403, 'Chỉ người đề xuất được gửi duyệt.', 'FORBIDDEN')
        event.status = 'PENDING_APPROVAL'
        event.rejectionReason = null
        break
      case 'APPROVE': {
        if (event.status !== 'PENDING_APPROVAL') return invalid()
        if (!can(user.value.id, clubId, 'APPROVE_EVENT')) return forbidden(clubId, 'APPROVE_EVENT', 'duyệt đề xuất sự kiện')
        const leadId = body.leadUserId ?? event.proposerId
        if (!memberCandidates(event.clubId, null).some((candidate) => candidate.id === leadId)) {
          return problem(422, 'Người được chọn không đủ điều kiện làm Trưởng BTC. Hãy chỉ định thành viên khác.', 'LEAD_NOT_ELIGIBLE')
        }
        event.status = 'APPROVED'
        event.approverId = user.value.id
        ensureEventFund(event.id, event.clubId)
        grantPosition({ userId: leadId, clubId: event.clubId, role: 'EVENT_LEAD', scopeId: event.id, assignedBy: user.value.id })
        notifyEventRole(leadId, event, 'Bạn được chọn làm Trưởng BTC', user.value.id)
        break
      }
      case 'REJECT':
        if (event.status !== 'PENDING_APPROVAL') return invalid()
        if (!can(user.value.id, clubId, 'APPROVE_EVENT')) return forbidden(clubId, 'APPROVE_EVENT', 'từ chối đề xuất')
        if (reason.length < 5) return needReason()
        event.status = 'DRAFT'
        event.rejectionReason = reason
        break
      case 'OPEN_REGISTRATION':
        if (event.status !== 'APPROVED') return invalid()
        if (!runs) return forbidden(clubId, 'RUN_EVENT', 'mở đăng ký', eventScope(event))
        event.status = 'REGISTRATION_OPEN'
        break
      case 'CANCEL':
        if (!CANCELLABLE.includes(event.status)) return problem(422, 'Sự kiện đã diễn ra thì chỉ có thể quyết toán rồi đóng, không hủy được.', 'INVALID_TRANSITION')
        if (!can(user.value.id, clubId, 'CREATE_EVENT')) return forbidden(clubId, 'CREATE_EVENT', 'hủy sự kiện')
        if (reason.length < 5) return needReason()
        notify(cancellationRecipients(event), {
          clubId: event.clubId,
          category: 'EVENT',
          title: `Sự kiện ${event.name} đã bị hủy`,
          body: `Lý do: ${reason}`,
          target: eventTarget(event.clubId, event.id),
          actorId: user.value.id,
        })
        event.statusBeforeCancel = event.status
        event.status = 'CANCELLED'
        event.cancellationReason = reason
        endEventPositions(event.id, 'Sự kiện đã hủy.')
        break
      case 'CLOSE': {
        if (event.status !== 'ENDED') return invalid()
        if (!runs) return forbidden(clubId, 'RUN_EVENT', 'đóng sự kiện', eventScope(event))
        if (!fundSettled(event)) return problem(422, 'Quỹ sự kiện chưa quyết toán nên chưa đóng được sự kiện.', 'FUND_NOT_SETTLED')
        event.status = 'CLOSED'
        endEventPositions(event.id, 'Sự kiện đã đóng.')
        break
      }
      default:
        return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    }
    event.version += 1
    return HttpResponse.json(toDetail(event, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/events/:eventId/subcommittees`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!eventActions(user.value.id, event).includes('VIEW_STAFF')) {
      return problem(403, 'Chỉ ban tổ chức và ban chủ nhiệm được xem cơ cấu BTC.', 'FORBIDDEN')
    }
    return HttpResponse.json(
      db.subcommittees.filter((subcommittee) => subcommittee.eventId === event.id).map((subcommittee) => toSubcommittee(subcommittee, event, user.value.id)),
    )
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/subcommittees`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!eventActions(user.value.id, event).includes('MANAGE_SUBCOMMITTEES')) {
      return forbidden(event.clubId, 'MANAGE_EVENT_STAFF', 'lập tiểu ban', eventScope(event))
    }
    const body = (await request.json()) as Partial<CreateSubcommitteeRequest>
    const name = (body.name ?? '').trim()
    const errors = [
      ...(name.length < 2 ? [{ field: 'name', message: 'Tên tiểu ban cần ít nhất 2 ký tự.' }] : []),
      ...(db.subcommittees.some((subcommittee) => subcommittee.eventId === event.id && subcommittee.name.toLowerCase() === name.toLowerCase())
        ? [{ field: 'name', message: 'Sự kiện đã có tiểu ban trùng tên.' }]
        : []),
      ...(body.quota !== null && body.quota !== undefined && (!Number.isInteger(body.quota) || body.quota <= 0)
        ? [{ field: 'quota', message: 'Chỉ tiêu là số nguyên dương hoặc để trống.' }]
        : []),
      ...(body.leadUserId && !memberCandidates(event.clubId, null).some((candidate) => candidate.id === body.leadUserId)
        ? [{ field: 'leadUserId', message: 'Trưởng tiểu ban phải là thành viên Thử việc hoặc Chính thức của CLB.' }]
        : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin tiểu ban chưa hợp lệ.', 'VALIDATION', errors)
    const leadId = body.leadUserId ?? null
    if (leadId && leadsOtherSubcommittee(event.id, leadId)) {
      return problem(422, 'Người này đã là trưởng một tiểu ban khác trong sự kiện.', 'LEAD_TAKEN', [
        { field: 'leadUserId', message: 'Đã là trưởng tiểu ban khác.' },
      ])
    }
    const subcommittee: DbSubcommittee = { id: newId('sc'), eventId: event.id, name, description: (body.description ?? '').trim(), quota: body.quota ?? null }
    db.subcommittees.push(subcommittee)
    if (leadId) assignSubcommitteeLead(event, subcommittee, leadId, user.value.id)
    return HttpResponse.json(toSubcommittee(subcommittee, event, user.value.id), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/events/:eventId/staff-candidates`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    // Người lập tiểu ban cần danh sách để chọn trưởng, kể cả khi sự kiện chưa có tiểu ban nào (FR-EVT-04).
    const canPick =
      eventActions(user.value.id, event).includes('MANAGE_SUBCOMMITTEES') ||
      db.subcommittees
        .filter((subcommittee) => subcommittee.eventId === event.id)
        .some((subcommittee) => toSubcommittee(subcommittee, event, user.value.id).allowedActions.includes('INVITE_MEMBER'))
    if (!canPick) return problem(403, 'Bạn không có quyền mời nhân sự cho sự kiện này.', 'FORBIDDEN')
    return HttpResponse.json(memberCandidates(event.clubId, new URL(request.url).searchParams.get('q')))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/subcommittees/:subcommitteeId/members`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    const subcommittee = db.subcommittees.find((candidate) => candidate.id === params.subcommitteeId && candidate.eventId === params.eventId)
    if (!event || !subcommittee || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy tiểu ban.', 'NOT_FOUND')
    if (!toSubcommittee(subcommittee, event, user.value.id).allowedActions.includes('INVITE_MEMBER')) {
      return forbidden(event.clubId, 'MANAGE_EVENT_STAFF', 'mời nhân sự vào tiểu ban này', { type: 'SUBCOMMITTEE', id: subcommittee.id })
    }
    const body = (await request.json()) as { userId?: string }
    if (!body.userId || !memberCandidates(event.clubId, null).some((candidate) => candidate.id === body.userId)) {
      return problem(400, 'Chỉ mời được thành viên Thử việc hoặc Chính thức của CLB chủ trì.', 'VALIDATION', [
        { field: 'userId', message: 'Người được mời không hợp lệ.' },
      ])
    }
    if (db.eventStaff.some((staff) => staff.subcommitteeId === subcommittee.id && staff.userId === body.userId && staff.leftAt === null)) {
      return problem(409, 'Người này đã là nhân sự của tiểu ban.', 'ALREADY_STAFF')
    }
    db.eventStaff.push({ userId: body.userId, eventId: event.id, subcommitteeId: subcommittee.id, kind: 'MEMBER', joinedAt: nowIso(), leftAt: null })
    notifyEventRole(body.userId, event, `Bạn được mời vào tiểu ban ${subcommittee.name} của`, user.value.id)
    return HttpResponse.json(toSubcommittee(subcommittee, event, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/subcommittees/:subcommitteeId/collaborators`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    const subcommittee = db.subcommittees.find((candidate) => candidate.id === params.subcommitteeId && candidate.eventId === params.eventId)
    if (!event || !subcommittee || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy tiểu ban.', 'NOT_FOUND')
    if (!can(user.value.id, event.clubId, 'MANAGE_EVENT_STAFF', eventScope(event))) {
      return forbidden(event.clubId, 'MANAGE_EVENT_STAFF', 'thêm cộng tác viên cho sự kiện', eventScope(event))
    }
    if (!STAFF_ACTIVE.includes(event.status)) return problem(422, `Sự kiện ${statusLabel[event.status]} nên không thêm nhân sự được.`, 'EVENT_READ_ONLY')
    const body = (await request.json()) as { email?: string }
    const email = normalizeEmail(body.email ?? '')
    if (!isEmail(email)) return problem(400, 'Email chưa hợp lệ.', 'VALIDATION', [{ field: 'email', message: 'Nhập email tài khoản của người cần thêm.' }])
    // Chỉ báo không tìm thấy, không nói tài khoản đang bị khóa hay chưa xác thực, để không dò được tài khoản.
    const account = db.users.find((candidate) => normalizeEmail(candidate.email) === email && candidate.status === 'ACTIVE' && candidate.accountType === 'USER')
    if (!account) {
      return problem(422, 'Không có tài khoản đang hoạt động nào dùng email này.', 'ACCOUNT_NOT_FOUND', [{ field: 'email', message: 'Không tìm thấy tài khoản.' }])
    }
    // CTV là người ngoài CLB: mọi tư cách chưa Đã rời đều bị từ chối; người đã rời, kể cả Trưởng BTC cũ, thêm lại được (báo cáo 17/11, mục 1.5).
    const standing = membershipOf(account.id, event.clubId)?.status
    if (standing !== undefined) {
      const detail =
        standing === 'PENDING'
          ? 'Người này đang chờ ban chủ nhiệm duyệt gia nhập CLB nên không thêm làm cộng tác viên được.'
          : standing === 'ON_LEAVE'
            ? 'Người này là thành viên CLB đang Tạm nghỉ nên không thêm vào ban tổ chức được.'
            : 'Người này đang là thành viên CLB; dùng nút Mời để thêm như thành viên.'
      return problem(422, detail, 'IS_MEMBER', [{ field: 'email', message: 'Đang có tư cách ở CLB.' }])
    }
    if (db.eventStaff.some((staff) => staff.subcommitteeId === subcommittee.id && staff.userId === account.id && staff.leftAt === null)) {
      return problem(409, 'Người này đã là nhân sự của tiểu ban.', 'ALREADY_STAFF')
    }
    db.eventStaff.push({ userId: account.id, eventId: event.id, subcommitteeId: subcommittee.id, kind: 'COLLABORATOR', joinedAt: nowIso(), leftAt: null })
    notifyEventRole(account.id, event, `Bạn được thêm làm cộng tác viên tiểu ban ${subcommittee.name} của`, user.value.id)
    return HttpResponse.json(toSubcommittee(subcommittee, event, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/events/:eventId/registrations`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!eventActions(user.value.id, event).includes('VIEW_REGISTRATIONS')) {
      return problem(403, 'Chỉ ban tổ chức và ban chủ nhiệm được xem danh sách tham dự.', 'FORBIDDEN')
    }
    const url = new URL(request.url)
    const keyword = url.searchParams.get('q')
    const order = (registration: DbRegistration) => (holdsSeat(registration) ? 0 : 1)
    const rows: Registration[] = activeRegistrations(event.id)
      .filter((registration) => matchesKeyword(person(registration.userId).fullName, keyword))
      .sort((a, b) => order(a) - order(b) || Date.parse(a.registeredAt) - Date.parse(b.registeredAt))
      .map((registration) => ({
        id: registration.id,
        attendee: person(registration.userId),
        status: registration.status,
        waitlistPosition: waitlistPosition(registration),
        registeredAt: registration.registeredAt,
        promotedAt: registration.promotedAt,
      }))
    return HttpResponse.json(paginate(rows, url, 20))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/registrations`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!registrationOpen(event)) return problem(422, 'Sự kiện chưa mở đăng ký hoặc đã hết hạn đăng ký.', 'REGISTRATION_CLOSED')
    if (!isActiveMember(user.value.id, event.clubId)) return problem(403, 'Chỉ thành viên Thử việc hoặc Chính thức được đăng ký tham dự.', 'FORBIDDEN')
    if (myRegistration(user.value.id, event)) return problem(409, 'Bạn đã đăng ký sự kiện này.', 'ALREADY_REGISTERED')
    // BR-EVT-03: không vượt số chỗ; người đăng ký sau vào danh sách chờ theo thứ tự thời gian.
    const status = event.capacity === null || seatsTaken(event.id) < event.capacity ? 'CONFIRMED' : 'WAITLISTED'
    const registration: DbRegistration = {
      id: newId('r'),
      eventId: event.id,
      userId: user.value.id,
      status,
      registeredAt: nowIso(),
      cancelledAt: null,
      cancelKind: null,
      promotedAt: null,
      reconfirmDeadline: null,
    }
    db.registrations.push(registration)
    return HttpResponse.json(toMyRegistration(event, registration), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/registrations/:registrationId/cancellation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    const registration = db.registrations.find((candidate) => candidate.id === params.registrationId && candidate.eventId === params.eventId)
    // Chỉ chính người đăng ký hủy được; đăng ký của người khác coi như không tồn tại.
    if (!event || !registration || registration.userId !== user.value.id) return problem(404, 'Không tìm thấy đăng ký.', 'REGISTRATION_NOT_FOUND')
    if (registration.status === 'CANCELLED') return problem(422, 'Đăng ký này đã hủy.', 'REGISTRATION_CANCELLED')
    if (!registrationsEditable(event)) return problem(422, 'Sự kiện đã bắt đầu hoặc không còn nhận thay đổi đăng ký.', 'REGISTRATION_LOCKED')
    const deadline = cancelDeadlineOf(event, registration)
    if (Date.parse(deadline) <= Date.now()) {
      return problem(422, `Đã qua hạn hủy đăng ký (${formatDateTime(deadline)}). Liên hệ ban tổ chức nếu bạn không thể tham dự.`, 'CANCEL_DEADLINE_PASSED')
    }
    const freesSeat = holdsSeat(registration)
    Object.assign(registration, { status: 'CANCELLED', cancelledAt: nowIso(), cancelKind: 'SELF' })
    if (freesSeat) promoteWaitlist(event, user.value.id)
    return HttpResponse.json(toMyRegistration(event, registration))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/reschedule`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    if (!event || !canViewEvent(user.value.id, event)) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (!can(user.value.id, event.clubId, 'RUN_EVENT', eventScope(event))) return forbidden(event.clubId, 'RUN_EVENT', 'dời thời gian sự kiện', eventScope(event))
    const body = (await request.json()) as Partial<RescheduleEventRequest>
    if (body.version !== event.version) return problem(409, 'Sự kiện vừa được người khác cập nhật. Tải lại để xem thời gian mới nhất.', 'VERSION_CONFLICT')
    if (!RESCHEDULABLE.includes(event.status)) {
      return problem(422, `Chỉ dời được sự kiện Đã duyệt hoặc Mở đăng ký; sự kiện đang ở trạng thái ${statusLabel[event.status]}.`, 'INVALID_TRANSITION')
    }
    if (!registrationsEditable(event)) return problem(422, 'Sự kiện đã bắt đầu nên không dời được.', 'EVENT_STARTED')
    const deadline = body.registrationDeadline === undefined ? event.registrationDeadline : body.registrationDeadline
    const reason = (body.reason ?? '').trim()
    const errors = rescheduleErrors(event, body, deadline, reason)
    if (errors.length > 0) return problem(400, 'Thời gian mới chưa hợp lệ.', 'VALIDATION', errors)
    const change: DbScheduleChange = {
      at: nowIso(),
      actorId: user.value.id,
      actorName: person(user.value.id).fullName,
      fromStartAt: event.startAt,
      fromEndAt: event.endAt,
      toStartAt: body.startAt as string,
      toEndAt: body.endAt as string,
      reason,
    }
    event.scheduleChanges.push(change)
    Object.assign(event, { startAt: change.toStartAt, endAt: change.toEndAt, registrationDeadline: deadline })
    const { seated, deadline: confirmBy } = requireReconfirmation(event, user.value.id)
    notifyReschedule(event, change, seated, confirmBy)
    event.version += 1
    return HttpResponse.json(toDetail(event, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/events/:eventId/registrations/:registrationId/reconfirmation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const event = findEvent(params)
    const registration = db.registrations.find((candidate) => candidate.id === params.registrationId && candidate.eventId === params.eventId)
    if (!event || !registration || registration.userId !== user.value.id) return problem(404, 'Không tìm thấy đăng ký.', 'REGISTRATION_NOT_FOUND')
    const deadlineText = formatDateTime(registration.reconfirmDeadline ?? event.startAt)
    if (registration.cancelKind === 'EXPIRED') return problem(422, `Đã quá hạn xác nhận (${deadlineText}) nên đăng ký đã bị hủy.`, 'RECONFIRM_DEADLINE_PASSED')
    if (registration.status === 'CANCELLED') return problem(422, 'Đăng ký này đã hủy.', 'REGISTRATION_CANCELLED')
    if (registration.status !== 'RECONFIRM_PENDING') return problem(422, 'Đăng ký này không cần xác nhận lại.', 'NOT_RECONFIRM_PENDING')
    if (!registrationsEditable(event)) return problem(422, 'Sự kiện đã bắt đầu hoặc không còn nhận thay đổi đăng ký.', 'REGISTRATION_LOCKED')
    // Không dựa vào việc theo giờ đã chạy trước request này.
    if (Date.parse(registration.reconfirmDeadline ?? '') <= Date.now()) return problem(422, `Đã quá hạn xác nhận (${deadlineText}).`, 'RECONFIRM_DEADLINE_PASSED')
    Object.assign(registration, { status: 'CONFIRMED', reconfirmDeadline: null })
    return HttpResponse.json(toMyRegistration(event, registration))
  }),
]

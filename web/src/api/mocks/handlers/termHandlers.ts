import { http, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type { TermSummary } from '@/features/club/model/clubTypes'
import type { StandingRole } from '@/features/org/model/orgTypes'
import type {
  AppointmentRequest,
  CompleteHandoverRequest,
  ConfirmItemsRequest,
  EventLeadDecisionRequest,
  Handover,
  HandoverAction,
  HandoverItem,
  HandoverItemKind,
  HandoverItemStatus,
  SaveAppointmentsRequest,
  StartHandoverRequest,
} from '@/features/term/model/handoverTypes'
import type { CreateTermRequest, DepartmentPlanEntryRequest, Term, TermAction, TermStatus, UpdateTermRequest } from '@/features/term/model/termTypes'
import { db, type DbAppointment, type DbHandover, type DbHandoverItem, type DbPlanEntry, type DbTerm } from '../db'
import { eventOfFund, fundBalance, fundName, pendingCountOf } from '../mockFinance'
import { API, currentUser, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, personRef } from '../mockMembers'
import { handoverTarget, notify } from '../mockNotifications'
import { can, forbidden } from '../mockAccess'
import { BOARD_ROLES, currentTermOf, positionHolderOf, positionTitles, STANDING_ROLES } from '../mockPermissions'
import { isTaskOverdue } from '../mockScopes'
import {
  activeDepartmentsOf,
  appointmentProblem,
  canViewHandover,
  compareHandoverItems,
  completeHandover,
  completionPreview,
  copyDepartmentPlan,
  dropBlockedReason,
  handoverBlockers,
  handoverCounts,
  handoverItemsOf,
  handoverOfTerm,
  isEligibleBoardAppointee,
  isLeadCandidate,
  keptDepartmentOptions,
  keptEntry,
  openHandoverOf,
  planEntryIdOf,
  preparingTermOf,
  resolvedPlan,
  syncHandoverItems,
  toPlanEntries,
} from '../mockTerms'
import { isRealDate, nowIso, vnToday } from '../mockTime'

const TERM_NAME_MIN = 3
const TERM_NAME_MAX = 80
const PLAN_NAME_MIN = 2
const PLAN_NAME_MAX = 80
const PLAN_DESCRIPTION_MAX = 500
const PLAN_MAX_ENTRIES = 50
const APPOINTMENTS_MAX = 60
const CONFIRMATIONS_MAX = 100
const ITEM_KINDS: HandoverItemKind[] = ['FUND', 'EVENT', 'TASK']
const ITEM_STATUSES: HandoverItemStatus[] = ['PENDING', 'CONFIRMED', 'RESOLVED']
const LIST_ORDER: Record<TermStatus, number> = { PREPARING: 0, RUNNING: 1, HANDING_OVER: 1, CLOSED: 2 }

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const boardOnly = (clubId: string, what: string) => forbidden(clubId, 'MANAGE_TERMS', what)

/** Body JSON có thể chứa kiểu bất kỳ; giá trị không phải chuỗi coi như rỗng để trả 400 thay vì lỗi máy chủ. */
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function termActions(term: DbTerm, viewerId: string, handover: DbHandover | undefined): TermAction[] {
  const managesTerms = can(viewerId, term.clubId, 'MANAGE_TERMS')
  const preparing = term.status === 'PREPARING'
  return [
    ...(preparing && managesTerms ? (['EDIT'] as const) : []),
    ...(preparing && managesTerms && currentTermOf(term.clubId)?.status === 'RUNNING' ? (['START_HANDOVER'] as const) : []),
    ...(handover && canViewHandover(viewerId, handover) ? (['VIEW_HANDOVER'] as const) : []),
  ]
}

function toTerm(term: DbTerm, viewerId: string): Term {
  const preparing = term.status === 'PREPARING'
  const handover = handoverOfTerm(term.id)
  const open = handover?.status === 'OPEN'
  if (handover && open) syncHandoverItems(handover)
  const counts = handover && open ? handoverCounts(handover.id) : null
  return {
    id: term.id,
    name: term.name,
    startOn: term.startOn,
    endOn: term.endOn,
    status: term.status,
    createdAt: term.createdAt,
    createdBy: term.createdBy ? personRef(term.createdBy) : null,
    closedAt: term.closedAt,
    departmentPlan: preparing ? toPlanEntries(term) : null,
    handoverId: handover?.id ?? null,
    handoverProgress: counts ? { pending: counts.pending, confirmed: counts.confirmed } : null,
    allowedActions: termActions(term, viewerId, handover),
    version: term.version,
  }
}

const termSummary = (term: DbTerm): TermSummary => ({ id: term.id, name: term.name, startOn: term.startOn, endOn: term.endOn, status: term.status })

function handoverActions(handover: DbHandover, viewerId: string): HandoverAction[] {
  if (handover.status !== 'OPEN') return []
  const managesTerms = can(viewerId, handover.clubId, 'MANAGE_TERMS')
  return [
    ...(managesTerms ? (['EDIT_APPOINTMENTS'] as const) : []),
    ...(isEligibleBoardAppointee(viewerId, handover) ? (['CONFIRM'] as const) : []),
    ...(managesTerms ? (['COMPLETE'] as const) : []),
  ]
}

function toHandover(handover: DbHandover, viewerId: string): Handover {
  syncHandoverItems(handover)
  const fromTerm = db.terms.find((term) => term.id === handover.fromTermId) as DbTerm
  const toTerm = db.terms.find((term) => term.id === handover.toTermId) as DbTerm
  const open = handover.status === 'OPEN'
  const options = keptDepartmentOptions(toTerm)
  return {
    id: handover.id,
    fromTerm: termSummary(fromTerm),
    toTerm: termSummary(toTerm),
    status: handover.status,
    startedAt: handover.startedAt,
    startedBy: personRef(handover.startedBy),
    completedAt: handover.completedAt,
    completedBy: handover.completedBy ? personRef(handover.completedBy) : null,
    appointments: handover.appointments.map((appointment) => {
      const problem = open ? appointmentProblem(appointment, handover) : null
      const known = options.find((option) => option.id === appointment.departmentId)
      const department = appointment.departmentId ? (known ?? { id: appointment.departmentId, name: db.departments.find((candidate) => candidate.id === appointment.departmentId)?.name ?? 'Ban' }) : null
      return { id: appointment.id, role: appointment.role, department, person: personRef(appointment.userId), eligible: problem === null, ineligibleReason: problem }
    }),
    departmentOptions: options,
    counts: handoverCounts(handover.id),
    blockers: open ? handoverBlockers(handover) : [],
    completionPreview: open ? completionPreview(handover) : null,
    allowedActions: handoverActions(handover, viewerId),
    version: handover.version,
  }
}

/** Sự kiện đã duyệt, chưa đóng thì ban chủ nhiệm mới phải chọn giữ hoặc thay Trưởng BTC (FR-TERM-05). */
const needsLeadDecision = (item: DbHandoverItem) => item.snapshot.kind === 'EVENT' && item.snapshot.needsLeadDecision

function toHandoverItem(item: DbHandoverItem, canConfirm: boolean): HandoverItem {
  const fund = item.kind === 'FUND' ? db.funds.find((candidate) => candidate.id === item.refId) : undefined
  const task = item.kind === 'TASK' ? db.tasks.find((candidate) => candidate.id === item.refId) : undefined
  const event = item.kind === 'EVENT' ? db.events.find((candidate) => candidate.id === item.refId) : undefined
  const leadId = event ? positionHolderOf('EVENT_LEAD', event.id) : null
  // Đổi quyết định Trưởng BTC được tới lúc hoàn tất, nên mục sự kiện đã xác nhận vẫn có CONFIRM.
  const confirmable = item.status === 'PENDING' || (item.status === 'CONFIRMED' && needsLeadDecision(item))
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    title: fund ? fundName(fund) : (task?.title ?? event?.name ?? ''),
    fund: fund ? { fundKind: fund.kind, balance: fundBalance(fund.id), pendingCount: pendingCountOf(fund.id), eventName: eventOfFund(fund)?.name ?? null } : null,
    task: task
      ? {
          departmentName: db.departments.find((department) => department.id === task.scopeId)?.name ?? '',
          owner: personRef(task.ownerId),
          assigner: personRef(task.assignerId),
          status: task.status,
          dueAt: task.dueAt,
          overdue: isTaskOverdue(task),
        }
      : null,
    event: event
      ? {
          status: event.status,
          startAt: event.startAt,
          endAt: event.endAt,
          lead: leadId ? personRef(leadId) : null,
          openTaskCount: db.tasks.filter(
            (candidate) =>
              candidate.scopeType === 'SUBCOMMITTEE' &&
              candidate.status !== 'DONE' &&
              candidate.status !== 'CANCELLED' &&
              db.subcommittees.some((subcommittee) => subcommittee.id === candidate.scopeId && subcommittee.eventId === event.id),
          ).length,
          needsLeadDecision: needsLeadDecision(item),
        }
      : null,
    eventLead: item.eventLead ? { action: item.eventLead.action, person: personRef(item.eventLead.userId) } : null,
    note: item.note,
    confirmedBy: item.confirmedBy ? personRef(item.confirmedBy) : null,
    confirmedAt: item.confirmedAt,
    allowedActions: canConfirm && confirmable ? ['CONFIRM'] : [],
    version: item.version,
  }
}

type ConfirmationPlan = { item: DbHandoverItem; eventLead: DbHandoverItem['eventLead'] }

/** FR-TERM-05: kiểm từng dòng xác nhận; sự kiện cần quyết định thì giữ (cần Trưởng BTC đang hiệu lực) hoặc thay bằng ứng viên hợp lệ. */
function leadDecisionOf(item: DbHandoverItem, request: EventLeadDecisionRequest | undefined, clubId: string, at: (field: string) => string): { eventLead: DbHandoverItem['eventLead']; error: FieldError | null } {
  const eventName = db.events.find((event) => event.id === item.refId)?.name ?? 'này'
  if (!needsLeadDecision(item)) {
    return { eventLead: null, error: request === undefined || request === null ? null : { field: at('eventLead'), message: 'Mục này không cần quyết định Trưởng BTC.' } }
  }
  const currentLead = item.snapshot.kind === 'EVENT' ? item.snapshot.leadId : null
  if (request?.action === 'KEEP') {
    if (currentLead === null) return { eventLead: null, error: { field: at('eventLead'), message: `Sự kiện ${eventName} chưa có Trưởng BTC đang hiệu lực, hãy chọn người thay.` } }
    return { eventLead: { action: 'KEEP', userId: currentLead }, error: null }
  }
  if (request?.action === 'REPLACE') {
    const userId = typeof request.userId === 'string' ? request.userId : ''
    if (!isLeadCandidate(clubId, userId)) {
      return { eventLead: null, error: { field: at('eventLead.userId'), message: 'Người được chọn không đủ điều kiện làm Trưởng BTC (cần là thành viên Thử việc hoặc Chính thức).' } }
    }
    // Chọn đúng Trưởng BTC hiện tại thì coi như giữ.
    return { eventLead: { action: userId === currentLead ? 'KEEP' : 'REPLACE', userId }, error: null }
  }
  return { eventLead: null, error: { field: at('eventLead'), message: `Chọn giữ hoặc thay Trưởng BTC của sự kiện ${eventName}.` } }
}

function findHandover(params: Record<string, string | readonly string[] | undefined>): DbHandover | undefined {
  return db.handovers.find((handover) => handover.id === params.handoverId && handover.clubId === params.clubId)
}

const isStandingRole = (role: unknown): role is StandingRole => STANDING_ROLES.includes(role as StandingRole)

/** FR-TERM-03: kết quả bầu gồm ban chủ nhiệm và trưởng, phó ban của các ban được giữ lại (BR-ORG-01). */
function appointmentsFromRequest(handover: DbHandover, body: unknown): { appointments: DbAppointment[]; errors: FieldError[] } {
  if (!Array.isArray(body)) return { appointments: [], errors: [{ field: 'appointments', message: 'Kết quả bầu phải là danh sách.' }] }
  if (body.length > APPOINTMENTS_MAX) return { appointments: [], errors: [{ field: 'appointments', message: `Kết quả bầu có tối đa ${APPOINTMENTS_MAX} dòng.` }] }
  const toTerm = db.terms.find((term) => term.id === handover.toTermId)
  const options = toTerm ? keptDepartmentOptions(toTerm) : []
  const errors: FieldError[] = []
  const appointments: DbAppointment[] = []
  const seen = new Set<string>()
  ;(body as unknown[]).forEach((value, index) => {
    const at = (field: string) => `appointments[${index}].${field}`
    const row = (typeof value === 'object' && value !== null ? value : {}) as Partial<AppointmentRequest>
    if (!isStandingRole(row.role)) {
      errors.push({ field: at('role'), message: 'Chọn một chức vụ thường trực.' })
      return
    }
    const departmentId = BOARD_ROLES.includes(row.role) ? null : typeof row.departmentId === 'string' ? row.departmentId : ''
    if (departmentId === '') {
      errors.push({ field: at('departmentId'), message: 'Chọn ban.' })
      return
    }
    const userId = typeof row.userId === 'string' ? row.userId : ''
    if (userId === '') {
      errors.push({ field: at('userId'), message: 'Chọn người được bầu.' })
      return
    }
    const key = `${row.role}|${departmentId ?? ''}|${userId}`
    if (seen.has(key)) {
      errors.push({ field: at('userId'), message: 'Người này đã có cùng chức vụ ở dòng khác.' })
      return
    }
    seen.add(key)
    const appointment: DbAppointment = { id: newId('ap'), role: row.role, departmentId, userId }
    if (departmentId !== null && !options.some((option) => option.id === departmentId)) {
      errors.push({ field: at('departmentId'), message: 'Chỉ bầu trước trưởng, phó ban cho ban được giữ trong kế hoạch của nhiệm kỳ mới.' })
      return
    }
    const problem = appointmentProblem(appointment, handover)
    if (problem) errors.push({ field: at('userId'), message: problem })
    // Giữ mã cũ cho dòng không đổi, để giao diện và thông báo nhận ra người đã có trong kết quả bầu.
    const previous = handover.appointments.find((candidate) => candidate.role === appointment.role && candidate.departmentId === departmentId && candidate.userId === userId)
    appointments.push(previous ?? appointment)
  })
  return { appointments, errors }
}

/** BR-TERM-01: ngày kết thúc sau ngày bắt đầu; nhiệm kỳ chưa chạy thì ngày kết thúc còn phải sau hôm nay. */
function termErrors(clubId: string, values: { name: string; startOn: unknown; endOn: unknown }, exceptId?: string): FieldError[] {
  const duplicate = db.terms.some((term) => term.clubId === clubId && term.id !== exceptId && term.name.toLowerCase() === values.name.toLowerCase())
  const startValid = isRealDate(values.startOn)
  const endValid = isRealDate(values.endOn)
  return [
    ...(values.name.length < TERM_NAME_MIN || values.name.length > TERM_NAME_MAX
      ? [{ field: 'name', message: `Tên nhiệm kỳ cần từ ${TERM_NAME_MIN} đến ${TERM_NAME_MAX} ký tự.` }]
      : duplicate
        ? [{ field: 'name', message: 'CLB đã có nhiệm kỳ trùng tên.' }]
        : []),
    ...(startValid ? [] : [{ field: 'startOn', message: 'Ngày bắt đầu không hợp lệ.' }]),
    ...(!endValid
      ? [{ field: 'endOn', message: 'Ngày kết thúc không hợp lệ.' }]
      : startValid && String(values.endOn) <= String(values.startOn)
        ? [{ field: 'endOn', message: 'Ngày kết thúc phải sau ngày bắt đầu.' }]
        : String(values.endOn) <= vnToday()
          ? [{ field: 'endOn', message: 'Ngày kết thúc phải sau hôm nay.' }]
          : []),
  ]
}

/** FR-TERM-01: kế hoạch gồm ban giữ lại (sửa được tên, mô tả), ban bỏ (phải hết thành viên) và ban mới. */
function planFromRequest(term: DbTerm, body: unknown): { plan: DbPlanEntry[]; errors: FieldError[] } {
  if (!Array.isArray(body)) return { plan: [], errors: [{ field: 'departmentPlan', message: 'Kế hoạch ban phải là danh sách các ban.' }] }
  if (body.length > PLAN_MAX_ENTRIES) return { plan: [], errors: [{ field: 'departmentPlan', message: `Kế hoạch ban có tối đa ${PLAN_MAX_ENTRIES} dòng.` }] }
  const active = new Map(activeDepartmentsOf(term.clubId).map((department) => [department.id, department]))
  const ownNewIds = new Set((term.departmentPlan ?? []).filter((entry) => entry.departmentId === null).map((entry) => entry.id))
  const errors: FieldError[] = []
  const plan: DbPlanEntry[] = []
  const rowOf = new Map<string, number>()
  const seen = new Set<string>()

  ;(body as unknown[]).forEach((value, index) => {
    const at = (field: string) => `departmentPlan[${index}].${field}`
    if (typeof value !== 'object' || value === null) {
      errors.push({ field: `departmentPlan[${index}]`, message: 'Dòng kế hoạch không hợp lệ.' })
      return
    }
    const row = value as Partial<DepartmentPlanEntryRequest>
    const departmentId = typeof row.departmentId === 'string' ? row.departmentId : null
    const department = departmentId === null ? undefined : active.get(departmentId)
    if (departmentId !== null && !department) {
      // Ban vừa bị đóng thì bỏ qua dòng đó; mã lạ mới là lỗi.
      const closedHere = db.departments.some((candidate) => candidate.id === departmentId && candidate.clubId === term.clubId)
      if (!closedHere) errors.push({ field: at('departmentId'), message: 'Ban không thuộc CLB này.' })
      return
    }
    if (department && seen.has(department.id)) {
      errors.push({ field: at('departmentId'), message: 'Ban này đã có trong kế hoạch.' })
      return
    }
    if (department) seen.add(department.id)
    if (row.dropped === true) {
      if (!department) return
      const blocked = dropBlockedReason(department)
      if (blocked) errors.push({ field: at('dropped'), message: blocked })
      plan.push({ ...keptEntry(department), dropped: true })
      return
    }
    const name = text(row.name)
    const description = text(row.description)
    if (name.length < PLAN_NAME_MIN || name.length > PLAN_NAME_MAX) errors.push({ field: at('name'), message: `Tên ban cần từ ${PLAN_NAME_MIN} đến ${PLAN_NAME_MAX} ký tự.` })
    if (description.length > PLAN_DESCRIPTION_MAX) errors.push({ field: at('description'), message: `Mô tả tối đa ${PLAN_DESCRIPTION_MAX} ký tự.` })
    const id = department ? planEntryIdOf(department.id) : row.id && ownNewIds.has(row.id) ? row.id : newId('pe')
    // Ban đã có: chỉ lưu phần người dùng thật sự sửa, phần giống hiện tại để trống cho kế hoạch theo Cơ cấu.
    const entry: DbPlanEntry = department
      ? { id, departmentId: department.id, name: name === department.name ? null : name, description: description === department.description ? null : description, dropped: false }
      : { id, departmentId: null, name, description, dropped: false }
    plan.push(entry)
    rowOf.set(entry.id, index)
  })

  // Ban đang hoạt động mà request không nhắc tới vẫn được giữ, nên tên của chúng chiếm chỗ trước.
  const kept = resolvedPlan(term, plan).filter((entry) => !entry.dropped)
  const names = new Set(kept.filter((entry) => !rowOf.has(entry.id)).map((entry) => entry.name.toLowerCase()))
  for (const entry of kept) {
    const row = rowOf.get(entry.id)
    if (row === undefined) continue
    const key = entry.name.toLowerCase()
    if (names.has(key)) errors.push({ field: `departmentPlan[${row}].name`, message: 'Kế hoạch đã có ban trùng tên.' })
    names.add(key)
  }
  return { plan, errors }
}

const handoverClosed = () => problem(422, 'Phiên bàn giao đã hoàn tất, không sửa được nữa.', 'HANDOVER_CLOSED')

export const termHandlers = [
  http.get(`${API}/clubs/:clubId/terms`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const terms = db.terms
      .filter((term) => term.clubId === clubId)
      .toSorted((a, b) => LIST_ORDER[a.status] - LIST_ORDER[b.status] || b.startOn.localeCompare(a.startOn))
      .map((term) => toTerm(term, user.value.id))
    return HttpResponse.json(terms)
  }),

  http.post(`${API}/clubs/:clubId/terms`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_TERMS')) return boardOnly(clubId, 'khai báo nhiệm kỳ mới')
    if (preparingTermOf(clubId)) return problem(409, 'CLB đã có một nhiệm kỳ đang chuẩn bị. Hãy sửa nhiệm kỳ đó thay vì khai báo thêm.', 'TERM_PREPARING_EXISTS')
    if (currentTermOf(clubId)?.status !== 'RUNNING') return problem(422, 'CLB chưa có nhiệm kỳ đang chạy nên chưa khai báo được nhiệm kỳ kế tiếp.', 'NO_RUNNING_TERM')
    const body = (await request.json()) as Partial<CreateTermRequest>
    const name = text(body.name)
    const errors = termErrors(clubId, { name, startOn: body.startOn, endOn: body.endOn })
    if (errors.length > 0) return problem(400, 'Thông tin nhiệm kỳ chưa hợp lệ.', 'VALIDATION', errors)
    const term: DbTerm = {
      id: newId('t'),
      clubId,
      name,
      startOn: String(body.startOn),
      endOn: String(body.endOn),
      status: 'PREPARING',
      createdAt: nowIso(),
      createdBy: user.value.id,
      closedAt: null,
      departmentPlan: copyDepartmentPlan(clubId),
      closedDepartments: null,
      version: 1,
    }
    db.terms.push(term)
    return HttpResponse.json(toTerm(term, user.value.id), { status: 201 })
  }),

  http.patch(`${API}/clubs/:clubId/terms/:termId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const term = db.terms.find((candidate) => candidate.id === params.termId && candidate.clubId === clubId)
    if (!term) return problem(404, 'Không tìm thấy nhiệm kỳ.', 'TERM_NOT_FOUND')
    if (!can(user.value.id, clubId, 'MANAGE_TERMS')) return boardOnly(clubId, 'sửa nhiệm kỳ')
    const body = (await request.json()) as Partial<UpdateTermRequest>
    if (body.version !== term.version) return problem(409, 'Nhiệm kỳ vừa được người khác cập nhật. Tải lại để xem thông tin mới nhất.', 'VERSION_CONFLICT')
    if (term.status !== 'PREPARING') return problem(422, 'Chỉ sửa được nhiệm kỳ đang chuẩn bị.', 'TERM_NOT_EDITABLE')
    const name = body.name === undefined ? term.name : text(body.name)
    const startOn = body.startOn ?? term.startOn
    const endOn = body.endOn ?? term.endOn
    const planned = body.departmentPlan === undefined ? null : planFromRequest(term, body.departmentPlan)
    // Chỉ sửa kế hoạch ban thì không xét lại tên và ngày, để lỗi luôn rơi vào ô người dùng đang sửa.
    const editsDetails = body.name !== undefined || body.startOn !== undefined || body.endOn !== undefined
    const errors = [...(editsDetails ? termErrors(clubId, { name, startOn, endOn }, term.id) : []), ...(planned?.errors ?? [])]
    if (errors.length > 0) return problem(400, 'Thông tin nhiệm kỳ chưa hợp lệ.', 'VALIDATION', errors)
    term.name = name
    term.startOn = startOn
    term.endOn = endOn
    if (planned) term.departmentPlan = planned.plan
    term.version += 1
    return HttpResponse.json(toTerm(term, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/handovers`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_TERMS')) return boardOnly(clubId, 'bắt đầu bàn giao nhiệm kỳ')
    const body = (await request.json()) as Partial<StartHandoverRequest>
    if (openHandoverOf(clubId)) return problem(409, 'CLB đang có một phiên bàn giao chưa hoàn tất.', 'HANDOVER_EXISTS')
    const fromTerm = currentTermOf(clubId)
    const toTerm = preparingTermOf(clubId)
    if (!toTerm) return problem(422, 'Chưa có nhiệm kỳ Chuẩn bị để nhận bàn giao. Khai báo nhiệm kỳ mới trước.', 'NO_PREPARING_TERM')
    if (!fromTerm || fromTerm.status !== 'RUNNING' || body.fromTermId !== fromTerm.id || body.toTermId !== toTerm.id) {
      return problem(422, 'Nhiệm kỳ giao hoặc nhận không còn đúng. Tải lại trang Nhiệm kỳ rồi thử lại.', 'INVALID_TRANSITION')
    }
    fromTerm.status = 'HANDING_OVER'
    fromTerm.version += 1
    const handover: DbHandover = {
      id: newId('h'),
      clubId,
      fromTermId: fromTerm.id,
      toTermId: toTerm.id,
      status: 'OPEN',
      startedAt: nowIso(),
      startedBy: user.value.id,
      completedAt: null,
      completedBy: null,
      appointments: [],
      version: 1,
    }
    db.handovers.push(handover)
    return HttpResponse.json(toHandover(handover, user.value.id), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/handovers/:handoverId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const handover = findHandover(params)
    if (!handover) return problem(404, 'Không tìm thấy phiên bàn giao.', 'HANDOVER_NOT_FOUND')
    if (!canViewHandover(user.value.id, handover)) {
      return problem(403, 'Chỉ ban chủ nhiệm hiện tại và người được bầu vào ban chủ nhiệm mới xem được phiên bàn giao.', 'FORBIDDEN')
    }
    return HttpResponse.json(toHandover(handover, user.value.id))
  }),

  http.put(`${API}/clubs/:clubId/handovers/:handoverId/appointments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const handover = findHandover(params)
    if (!handover) return problem(404, 'Không tìm thấy phiên bàn giao.', 'HANDOVER_NOT_FOUND')
    if (!can(user.value.id, clubId, 'MANAGE_TERMS')) return boardOnly(clubId, 'ghi kết quả bầu')
    const body = (await request.json()) as Partial<SaveAppointmentsRequest>
    if (body.version !== handover.version) return problem(409, 'Phiên bàn giao vừa được người khác cập nhật. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
    if (handover.status !== 'OPEN') return handoverClosed()
    const { appointments, errors } = appointmentsFromRequest(handover, body.appointments)
    if (errors.length > 0) return problem(400, 'Kết quả bầu chưa hợp lệ.', 'VALIDATION', errors)
    const boardKey = (appointment: DbAppointment) => `${appointment.role}|${appointment.userId}`
    const before = new Set(handover.appointments.map(boardKey))
    handover.appointments = appointments
    handover.version += 1
    const toTerm = db.terms.find((term) => term.id === handover.toTermId)
    // FR-NOT-02: người mới được bầu vào ban chủ nhiệm cần mở phiên bàn giao để xác nhận từng mục.
    for (const appointment of appointments) {
      if (!BOARD_ROLES.includes(appointment.role) || before.has(boardKey(appointment))) continue
      notify([appointment.userId], {
        clubId,
        category: 'TERM',
        title: `Bạn được bầu làm ${positionTitles[appointment.role]} ${toTerm?.name ?? 'nhiệm kỳ mới'}, cần xác nhận bàn giao`,
        body: 'Mở phiên bàn giao để xem và xác nhận từng mục. Chức vụ mới có hiệu lực khi bàn giao hoàn tất.',
        target: handoverTarget(clubId, handover.id),
        actorId: user.value.id,
      })
    }
    return HttpResponse.json(toHandover(handover, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/handovers/:handoverId/items`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const handover = findHandover(params)
    if (!handover) return problem(404, 'Không tìm thấy phiên bàn giao.', 'HANDOVER_NOT_FOUND')
    if (!canViewHandover(user.value.id, handover)) {
      return problem(403, 'Chỉ ban chủ nhiệm hiện tại và người được bầu vào ban chủ nhiệm mới xem được danh mục bàn giao.', 'FORBIDDEN')
    }
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const status = url.searchParams.get('status')
    if ((kind !== null && !ITEM_KINDS.includes(kind as HandoverItemKind)) || (status !== null && !ITEM_STATUSES.includes(status as HandoverItemStatus))) {
      return problem(400, 'Bộ lọc danh mục không hợp lệ.', 'VALIDATION')
    }
    syncHandoverItems(handover)
    const canConfirm = handover.status === 'OPEN' && isEligibleBoardAppointee(user.value.id, handover)
    const items = handoverItemsOf(handover.id)
      .filter((item) => (kind === null || item.kind === kind) && (status === null || item.status === status))
      .toSorted(compareHandoverItems)
    const page = paginate(items, url, 50)
    return HttpResponse.json({ ...page, content: page.content.map((item) => toHandoverItem(item, canConfirm)) })
  }),

  http.post(`${API}/clubs/:clubId/handovers/:handoverId/confirmations`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const handover = findHandover(params)
    if (!handover) return problem(404, 'Không tìm thấy phiên bàn giao.', 'HANDOVER_NOT_FOUND')
    if (!isEligibleBoardAppointee(user.value.id, handover)) {
      return problem(403, 'Chỉ người được bầu Chủ nhiệm, Phó chủ nhiệm, Thủ quỹ mới và còn đủ điều kiện mới xác nhận được mục bàn giao.', 'FORBIDDEN')
    }
    const body = (await request.json()) as Partial<ConfirmItemsRequest>
    const rows: unknown[] = Array.isArray(body.items) ? body.items : []
    if (rows.length === 0 || rows.length > CONFIRMATIONS_MAX) {
      return problem(400, `Chọn từ 1 đến ${CONFIRMATIONS_MAX} mục để xác nhận.`, 'VALIDATION', [{ field: 'items', message: `Chọn từ 1 đến ${CONFIRMATIONS_MAX} mục để xác nhận.` }])
    }
    const own = new Map(handoverItemsOf(handover.id).map((item) => [item.id, item]))
    const shapeErrors: FieldError[] = []
    const seen = new Set<string>()
    rows.forEach((value, index) => {
      const row = (typeof value === 'object' && value !== null ? value : {}) as Partial<ConfirmItemsRequest['items'][number]>
      if (typeof row.itemId !== 'string' || !own.has(row.itemId)) shapeErrors.push({ field: `items[${index}].itemId`, message: 'Mục không thuộc phiên bàn giao này.' })
      else if (seen.has(row.itemId)) shapeErrors.push({ field: `items[${index}].itemId`, message: 'Mục này đã có ở dòng khác.' })
      else if (typeof row.version !== 'number') shapeErrors.push({ field: `items[${index}].version`, message: 'Thiếu version của mục.' })
      if (typeof row.itemId === 'string') seen.add(row.itemId)
    })
    if (shapeErrors.length > 0) return problem(400, 'Danh sách xác nhận chưa hợp lệ.', 'VALIDATION', shapeErrors)
    const requests = rows as ConfirmItemsRequest['items']

    // Đồng bộ trước rồi mới so version, để mục vừa đổi số liệu không được xác nhận theo dữ liệu cũ (NFR-REL-03).
    syncHandoverItems(handover)
    const stale = requests.flatMap((row, index) => {
      const item = own.get(row.itemId) as DbHandoverItem
      return item.version === row.version ? [] : [{ field: `items[${index}]`, message: `Mục ${toHandoverItem(item, false).title} vừa thay đổi.` }]
    })
    if (stale.length > 0) return problem(409, `${stale.length} mục vừa thay đổi sau khi bạn mở danh mục. Tải lại để xem số liệu mới rồi xác nhận lại.`, 'VERSION_CONFLICT', stale)
    if (handover.status !== 'OPEN') return handoverClosed()

    const closed = requests.flatMap((row, index) => {
      const item = own.get(row.itemId) as DbHandoverItem
      const title = toHandoverItem(item, false).title
      if (item.status === 'RESOLVED') return [{ field: `items[${index}].itemId`, message: `Mục ${title} không cần bàn giao nữa.` }]
      if (item.status === 'CONFIRMED' && !needsLeadDecision(item)) return [{ field: `items[${index}].itemId`, message: `Mục ${title} đã được xác nhận.` }]
      return []
    })
    if (closed.length > 0) return problem(422, 'Có mục không còn xác nhận được. Tải lại danh mục rồi thử lại.', 'ITEM_NOT_CONFIRMABLE', closed)

    const errors: FieldError[] = []
    const plans: ConfirmationPlan[] = []
    requests.forEach((row, index) => {
      const item = own.get(row.itemId) as DbHandoverItem
      const at = (field: string) => `items[${index}].${field}`
      const decision = leadDecisionOf(item, row.eventLead, clubId, at)
      if (decision.error) errors.push(decision.error)
      else plans.push({ item, eventLead: decision.eventLead })
    })
    if (errors.length > 0) return problem(400, 'Chưa xác nhận được các mục đã chọn.', 'VALIDATION', errors)

    const confirmedAt = nowIso()
    for (const { item, eventLead } of plans) {
      Object.assign(item, { status: 'CONFIRMED' as const, note: null, confirmedBy: user.value.id, confirmedAt, eventLead })
      item.version += 1
    }
    handover.version += 1
    return HttpResponse.json(toHandover(handover, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/handovers/:handoverId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const handover = findHandover(params)
    if (!handover) return problem(404, 'Không tìm thấy phiên bàn giao.', 'HANDOVER_NOT_FOUND')
    // BR-TERM-02: ban chủ nhiệm cũ giữ quyền tới lúc này nên chính họ hoàn tất; người được bầu chưa có quyền đó.
    if (!can(user.value.id, clubId, 'MANAGE_TERMS')) return boardOnly(clubId, 'hoàn tất bàn giao')
    const body = (await request.json()) as Partial<CompleteHandoverRequest>
    if (body.action !== 'COMPLETE') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION', [{ field: 'action', message: 'Chỉ hỗ trợ COMPLETE.' }])
    if (body.version !== handover.version) {
      return problem(409, 'Phiên bàn giao vừa thay đổi (có lượt xác nhận hoặc sửa kết quả bầu). Tải lại để xem lại trước khi hoàn tất.', 'VERSION_CONFLICT')
    }
    if (handover.status !== 'OPEN') return handoverClosed()
    syncHandoverItems(handover)
    const blockers = handoverBlockers(handover)
    if (blockers.length > 0) {
      return problem(422, 'Chưa hoàn tất được bàn giao vì còn điều kiện chưa đạt.', 'HANDOVER_BLOCKED', blockers.map((message) => ({ field: 'blockers', message })))
    }
    completeHandover(handover, user.value.id)
    return HttpResponse.json(toHandover(handover, user.value.id))
  }),
]

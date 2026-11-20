import { http, HttpResponse } from 'msw'
import type {
  CreateTaskRequest,
  FileRef,
  TaskAction,
  TaskDetail,
  TaskFacets,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  TaskTransitionAction,
  TaskTransitionRequest,
  UpdateTaskRequest,
} from '@/features/task/model/taskTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { validateUploadFile } from '@/shared/lib/validateUploadFile'
import { db } from '../db'
import { can, forbidden, type AccessScope } from '../mockAccess'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, personRef as person } from '../mockMembers'
import { isEventGuest } from '../mockStaffEvents'
import { isBoardMember } from '../mockPermissions'
import { assignableScopes, hasTaskAccess, isTaskOverdue as isOverdue, lockedEventStatusOf, managesScope, resolveScope } from '../mockScopes'
import { isDueSoon } from '../mockTaskJobs'
import { notify, taskTarget } from '../mockNotifications'
import { recordTaskChange, toTaskChange } from '../mockTasks'
import { nowIso } from '../mockTime'
import type { DbTask } from '../seed/taskSeed'

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const OPEN_STATUSES: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW']

/** Bảng chuyển ST-TASK của FR-TASK-03, 04, 05 và người được phép (BR-TASK-02). */
const TRANSITIONS: Record<TaskTransitionAction, { from: TaskStatus[]; to: TaskStatus; actor: 'owner' | 'assigner' }> = {
  START: { from: ['ASSIGNED'], to: 'IN_PROGRESS', actor: 'owner' },
  SUBMIT: { from: ['IN_PROGRESS'], to: 'PENDING_REVIEW', actor: 'owner' },
  APPROVE: { from: ['PENDING_REVIEW'], to: 'DONE', actor: 'assigner' },
  REQUEST_CHANGES: { from: ['PENDING_REVIEW'], to: 'IN_PROGRESS', actor: 'assigner' },
  CANCEL: { from: OPEN_STATUSES, to: 'CANCELLED', actor: 'assigner' },
}

const statusLabel: Record<TaskStatus, string> = {
  ASSIGNED: 'Mới giao',
  IN_PROGRESS: 'Đang làm',
  PENDING_REVIEW: 'Chờ nghiệm thu',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const reasonOk = (reason: string) => reason.length >= REASON_MIN && reason.length <= REASON_MAX
const reasonError = { field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }

/** FR-EVT-16: hồ sơ sự kiện Đã đóng, Đã hủy chỉ đọc, nên việc của tiểu ban cũng chỉ xem được. */
function eventLockReason(task: DbTask): string | null {
  const status = lockedEventStatusOf(task)
  if (status === 'CLOSED') return 'Sự kiện đã đóng nên công việc chỉ xem được.'
  if (status === 'CANCELLED') return 'Sự kiện đã hủy nên công việc chỉ xem được.'
  return null
}

const accessScopeOf = (task: DbTask): AccessScope => ({ type: task.scopeType, id: task.scopeId })

/** Phạm vi còn giao việc được (ban đang hoạt động, sự kiện còn chạy) mà người gọi có quyền giao; null là không đổi người được. */
const reassignScopeOf = (task: DbTask, userId: string) =>
  assignableScopes(userId, task.clubId).find((scope) => scope.type === task.scopeType && scope.id === task.scopeId) ?? null

function allowedActionsFor(task: DbTask, userId: string): TaskAction[] {
  if (!hasTaskAccess(task, userId) || eventLockReason(task) !== null) return []
  const transitions = (Object.keys(TRANSITIONS) as TaskTransitionAction[]).filter((action) => {
    const rule = TRANSITIONS[action]
    const actorId = rule.actor === 'owner' ? task.ownerId : task.assignerId
    return rule.from.includes(task.status) && actorId === userId
  })
  const editable = task.assignerId === userId && OPEN_STATUSES.includes(task.status)
  return [...transitions, ...(editable && reassignScopeOf(task, userId) ? (['REASSIGN'] as const) : []), ...(editable ? (['CHANGE_DUE'] as const) : [])]
}

function canViewTask(task: DbTask, userId: string): boolean {
  if (!hasTaskAccess(task, userId)) return false
  return (
    task.ownerId === userId ||
    task.assignerId === userId ||
    task.collaboratorIds.includes(userId) ||
    managesScope(userId, task.clubId, task.scopeType, task.scopeId)
  )
}

function toSummary(task: DbTask, userId: string): TaskSummary {
  return {
    id: task.id,
    clubId: task.clubId,
    clubName: db.clubs.find((club) => club.id === task.clubId)?.name ?? '',
    title: task.title,
    scope: resolveScope(task.scopeType, task.scopeId),
    assigner: person(task.assignerId),
    owner: person(task.ownerId),
    collaborators: task.collaboratorIds.map(person),
    dueAt: task.dueAt,
    priority: task.priority,
    status: task.status,
    overdue: isOverdue(task),
    dueSoon: isDueSoon(task),
    allowedActions: allowedActionsFor(task, userId),
    version: task.version,
  }
}

function fileRef(id: string): FileRef[] {
  const file = db.attachments.find((attachment) => attachment.id === id)
  return file ? [{ id: file.id, name: file.name, size: file.size, contentType: file.contentType }] : []
}

function toDetail(task: DbTask, userId: string): TaskDetail {
  return {
    ...toSummary(task, userId),
    description: task.description,
    submission: task.submission
      ? { note: task.submission.note, attachments: task.submission.attachmentIds.flatMap(fileRef), submittedAt: task.submission.submittedAt }
      : null,
    reviewComment: task.reviewComment,
    readOnlyReason: eventLockReason(task),
    cancelReason: task.cancelReason,
    history: [...task.history]
      .reverse()
      .map((entry) => ({ id: entry.id, at: entry.at, actor: person(entry.actorId), fromStatus: entry.fromStatus, toStatus: entry.toStatus, note: entry.note })),
    changes: [...task.changes].reverse().map(toTaskChange),
    overdueHistory: [...task.overdueLog].reverse(),
    createdAt: task.createdAt,
  }
}

function applyFilters(tasks: DbTask[], url: URL): DbTask[] {
  const statuses = url.searchParams.getAll('status')
  const priorities = url.searchParams.getAll('priority')
  const due = url.searchParams.get('due')
  const clubId = url.searchParams.get('clubId')
  const eventId = url.searchParams.get('eventId')
  const keyword = url.searchParams.get('q')
  const now = Date.now()
  return tasks
    .filter((task) => statuses.length === 0 || statuses.includes(task.status))
    .filter((task) => priorities.length === 0 || priorities.includes(task.priority))
    .filter((task) => !clubId || task.clubId === clubId)
    .filter((task) => !eventId || resolveScope(task.scopeType, task.scopeId).eventId === eventId)
    .filter((task) => matchesKeyword(`${task.title} ${task.description}`, keyword))
    .filter((task) => {
      if (!due) return true
      const dueAt = Date.parse(task.dueAt)
      if (due === 'OVERDUE') return isOverdue(task)
      if (due === 'THIS_WEEK') return dueAt >= now && dueAt - now <= WEEK_MS
      return dueAt - now > WEEK_MS
    })
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || Date.parse(a.dueAt) - Date.parse(b.dueAt))
}

const isMine = (task: DbTask, userId: string) => (task.ownerId === userId || task.collaboratorIds.includes(userId)) && hasTaskAccess(task, userId)

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item))

/** FR-TASK-05: đổi người chính, người phối hợp, hạn; trả lỗi hoặc null khi đã lưu. Thứ tự kiểm: quyền → version → trạng thái → giá trị. */
function updateTask(task: DbTask, body: Partial<UpdateTaskRequest>, actorId: string): Response | null {
  if (task.assignerId !== actorId) return problem(403, 'Chỉ người giao việc được đổi người, đổi hạn hoặc hủy việc.', 'FORBIDDEN')
  const ownerId = typeof body.ownerId === 'string' ? body.ownerId : task.ownerId
  const collaboratorIds = isStringList(body.collaboratorIds) ? [...new Set(body.collaboratorIds)] : task.collaboratorIds
  const changesOwner = ownerId !== task.ownerId
  const changesCollaborators = !sameSet(collaboratorIds, task.collaboratorIds)
  const dueAt = typeof body.dueAt === 'string' ? body.dueAt : task.dueAt
  const changesDue = Date.parse(dueAt) !== Date.parse(task.dueAt)
  const changesPeople = changesOwner || changesCollaborators
  if (changesPeople && !can(actorId, task.clubId, 'ASSIGN_TASK', accessScopeOf(task))) {
    return forbidden(task.clubId, 'ASSIGN_TASK', 'đổi người làm việc trong phạm vi này', accessScopeOf(task))
  }
  if (body.version !== task.version) return problem(409, 'Công việc vừa được người khác cập nhật. Tải lại để xem bản mới nhất.', 'VERSION_CONFLICT')
  const lockReason = eventLockReason(task)
  if (lockReason) return problem(422, lockReason, 'EVENT_READ_ONLY')
  if (!OPEN_STATUSES.includes(task.status)) return problem(422, `Việc đã ${statusLabel[task.status]} nên không sửa được nữa.`, 'TASK_CLOSED')
  const scope = changesPeople ? reassignScopeOf(task, actorId) : null
  if (changesPeople && !scope) return problem(422, 'Ban đã đóng hoặc sự kiện không còn hoạt động nên không đổi người làm được.', 'SCOPE_CLOSED')

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const memberIds = new Set(scope?.members.map((member) => member.id) ?? [])
  const added = collaboratorIds.filter((id) => !task.collaboratorIds.includes(id))
  const errors = [
    ...(body.ownerId !== undefined && typeof body.ownerId !== 'string' ? [{ field: 'ownerId', message: 'Người chính không hợp lệ.' }] : []),
    ...(body.collaboratorIds !== undefined && !isStringList(body.collaboratorIds) ? [{ field: 'collaboratorIds', message: 'Danh sách người phối hợp không hợp lệ.' }] : []),
    // BR-TASK-01, BR-MEM-05: người mới phải còn thuộc phạm vi và không Tạm nghỉ; người phối hợp cũ được giữ lại.
    ...(changesOwner && !memberIds.has(ownerId) ? [{ field: 'ownerId', message: 'Người chính phải là thành viên đang hoạt động của phạm vi việc.' }] : []),
    ...(collaboratorIds.includes(ownerId) ? [{ field: 'collaboratorIds', message: 'Người phối hợp phải khác người chính.' }] : []),
    ...(added.some((id) => !memberIds.has(id)) ? [{ field: 'collaboratorIds', message: 'Người phối hợp mới phải là thành viên đang hoạt động của phạm vi việc.' }] : []),
    ...(changesDue && (Number.isNaN(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now()) ? [{ field: 'dueAt', message: 'Hạn mới phải sau thời điểm hiện tại.' }] : []),
    ...(!reasonOk(reason) ? [reasonError] : []),
  ]
  if (errors.length > 0) return problem(400, 'Thông tin thay đổi chưa hợp lệ.', 'VALIDATION', errors)
  if (!changesPeople && !changesDue) return problem(400, 'Chưa có thay đổi nào để lưu.', 'VALIDATION')

  const target = taskTarget(task.clubId, task.id)
  const input = { clubId: task.clubId, category: 'TASK' as const, actorId, body: `Lý do: ${reason}` }
  const newcomers = [...(changesOwner ? [ownerId] : []), ...added]
  // Người mới được giao nhận hạn ngay trong thông báo giao việc nên không cần thêm thông báo đổi hạn.
  const welcome = { ...input, target, body: `Hạn: ${formatDateTime(dueAt)}. Lý do: ${reason}` }
  if (changesOwner) {
    recordTaskChange(task, { actorId, field: 'OWNER', from: [task.ownerId], to: [ownerId], reason })
    notify([ownerId], { ...welcome, title: `Bạn được giao việc: ${task.title}` })
    if (!collaboratorIds.includes(task.ownerId)) notify([task.ownerId], { ...input, title: `Bạn không còn là người chính của việc: ${task.title}` })
  }
  if (changesCollaborators) {
    recordTaskChange(task, { actorId, field: 'COLLABORATORS', from: task.collaboratorIds, to: collaboratorIds, reason })
    notify(added, { ...welcome, title: `Bạn được thêm phối hợp việc: ${task.title}` })
    const removed = task.collaboratorIds.filter((id) => !collaboratorIds.includes(id) && id !== ownerId)
    notify(removed, { ...input, title: `Bạn không còn phối hợp việc: ${task.title}` })
  }
  if (changesDue) {
    recordTaskChange(task, { actorId, field: 'DUE_AT', from: [task.dueAt], to: [dueAt], reason })
    const told = [ownerId, ...collaboratorIds].filter((id) => !newcomers.includes(id))
    notify(told, { ...input, title: `Hạn việc ${task.title} đổi thành ${formatDateTime(dueAt)}`, target })
  }
  Object.assign(task, { ownerId, collaboratorIds, dueAt, version: task.version + 1 })
  // Thông báo đổi hạn, giao việc vừa gửi đã nêu hạn mới, nên hạn mới đã trong khoảng nhắc thì không nhắc thêm.
  if (changesDue && isDueSoon(task)) task.remindedFor = task.dueAt
  return null
}

export const taskHandlers = [
  http.get(`${API}/me/tasks/facets`, async () => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const mine = db.tasks.filter((task) => isMine(task, user.value.id))
    const clubs = new Map<string, string>()
    const events = new Map<string, { id: string; name: string; clubName: string }>()
    for (const task of mine) {
      const clubName = db.clubs.find((club) => club.id === task.clubId)?.name ?? ''
      // Lọc theo CLB chỉ có ích khi CLB đó còn việc hiện ở danh sách; việc của sự kiện đã đóng, hủy tra qua bộ lọc sự kiện.
      if (lockedEventStatusOf(task) === null) clubs.set(task.clubId, clubName)
      const scope = resolveScope(task.scopeType, task.scopeId)
      if (scope.eventId && scope.eventName) events.set(scope.eventId, { id: scope.eventId, name: scope.eventName, clubName })
    }
    const facets: TaskFacets = { clubs: [...clubs].map(([id, name]) => ({ id, name })), events: [...events.values()] }
    return HttpResponse.json(facets)
  }),

  http.get(`${API}/me/tasks`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const url = new URL(request.url)
    // Việc của sự kiện đã đóng, hủy chỉ còn để tra cứu nên chỉ hiện khi lọc đúng sự kiện đó (FR-EVT-16).
    const byEvent = Boolean(url.searchParams.get('eventId'))
    const mine = applyFilters(
      db.tasks.filter((task) => isMine(task, user.value.id) && (byEvent || lockedEventStatusOf(task) === null)),
      url,
    )
    const page = paginate(mine, url)
    return HttpResponse.json({ ...page, content: page.content.map((task) => toSummary(task, user.value.id)) })
  }),

  http.get(`${API}/clubs/:clubId/tasks`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    const url = new URL(request.url)
    const visible = db.tasks.filter((task) => task.clubId === clubId && (isBoardMember(user.value.id, clubId) || canViewTask(task, user.value.id)))
    const page = paginate(applyFilters(visible, url), url)
    return HttpResponse.json({ ...page, content: page.content.map((task) => toSummary(task, user.value.id)) })
  }),

  http.get(`${API}/clubs/:clubId/task-scopes`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId) && !isEventGuest(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    return HttpResponse.json(assignableScopes(user.value.id, clubId))
  }),

  http.get(`${API}/clubs/:clubId/tasks/:taskId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const task = db.tasks.find((candidate) => candidate.id === params.taskId && candidate.clubId === params.clubId)
    if (!task) return problem(404, 'Không tìm thấy công việc.', 'TASK_NOT_FOUND')
    if (!canViewTask(task, user.value.id)) return problem(403, 'Bạn không có quyền xem công việc này.', 'FORBIDDEN')
    return HttpResponse.json(toDetail(task, user.value.id))
  }),

  http.patch(`${API}/clubs/:clubId/tasks/:taskId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const task = db.tasks.find((candidate) => candidate.id === params.taskId && candidate.clubId === params.clubId)
    if (!task) return problem(404, 'Không tìm thấy công việc.', 'TASK_NOT_FOUND')
    if (!canViewTask(task, user.value.id)) return problem(403, 'Bạn không có quyền với công việc này.', 'FORBIDDEN')
    const failure = updateTask(task, (await request.json()) as Partial<UpdateTaskRequest>, user.value.id)
    return failure ?? HttpResponse.json(toDetail(task, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/tasks`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    // Nhân sự CLB đồng tổ chức làm trưởng tiểu ban giao việc trong tiểu ban của mình (FR-EVT-08); phạm vi kiểm ngay dưới.
    if (!canAccessClub(user.value.id, clubId) && !isEventGuest(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    const body = (await request.json()) as Partial<CreateTaskRequest>
    const scope = assignableScopes(user.value.id, clubId).find((candidate) => candidate.type === body.scopeType && candidate.id === body.scopeId)
    if (!scope) return problem(403, 'Bạn chỉ được giao việc trong ban, tiểu ban mình phụ trách.', 'SCOPE_FORBIDDEN')
    const memberIds = new Set(scope.members.map((member) => member.id))
    const title = (body.title ?? '').trim()
    const collaboratorIds = body.collaboratorIds ?? []
    const errors = [
      ...(title.length < 3 ? [{ field: 'title', message: 'Tên việc cần ít nhất 3 ký tự.' }] : []),
      ...(!body.ownerId || !memberIds.has(body.ownerId) ? [{ field: 'ownerId', message: 'Người chính phải là thành viên của phạm vi đã chọn.' }] : []),
      ...(collaboratorIds.some((id) => !memberIds.has(id) || id === body.ownerId)
        ? [{ field: 'collaboratorIds', message: 'Người phối hợp phải thuộc phạm vi và khác người chính.' }]
        : []),
      ...(!body.dueAt || Number.isNaN(Date.parse(body.dueAt)) || Date.parse(body.dueAt) <= Date.now()
        ? [{ field: 'dueAt', message: 'Hạn phải sau thời điểm hiện tại.' }]
        : []),
      ...(!body.priority || !PRIORITIES.includes(body.priority) ? [{ field: 'priority', message: 'Mức ưu tiên không hợp lệ.' }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin giao việc chưa hợp lệ.', 'VALIDATION', errors)
    const createdAt = nowIso()
    const task: DbTask = {
      id: newId('t'),
      clubId,
      title,
      description: (body.description ?? '').trim(),
      scopeType: scope.type,
      scopeId: scope.id,
      assignerId: user.value.id,
      ownerId: body.ownerId as string,
      collaboratorIds,
      dueAt: body.dueAt as string,
      priority: body.priority as TaskPriority,
      status: 'ASSIGNED',
      submission: null,
      reviewComment: null,
      cancelReason: null,
      history: [{ id: newId('h'), at: createdAt, actorId: user.value.id, fromStatus: null, toStatus: 'ASSIGNED', note: null }],
      changes: [],
      remindedFor: null,
      overdueLog: [],
      createdAt,
      version: 1,
    }
    // Thông báo giao việc đã nêu hạn, nên việc giao khi đã vào khoảng nhắc không nhắc thêm lần nữa.
    if (isDueSoon(task)) task.remindedFor = task.dueAt
    db.tasks.push(task)
    notify([task.ownerId, ...task.collaboratorIds], {
      clubId,
      category: 'TASK',
      title: `Bạn được giao việc: ${task.title}`,
      body: `Hạn: ${formatDateTime(task.dueAt)}.`,
      target: taskTarget(clubId, task.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toDetail(task, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/tasks/:taskId/attachments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const task = db.tasks.find((candidate) => candidate.id === params.taskId && candidate.clubId === params.clubId)
    if (!task) return problem(404, 'Không tìm thấy công việc.', 'TASK_NOT_FOUND')
    if (!hasTaskAccess(task, user.value.id) || (task.ownerId !== user.value.id && !task.collaboratorIds.includes(user.value.id))) {
      return problem(403, 'Chỉ người chính và người phối hợp được đính kèm tệp cho việc này.', 'FORBIDDEN')
    }
    const lockReason = eventLockReason(task)
    if (lockReason) return problem(422, lockReason, 'EVENT_READ_ONLY')
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return problem(400, 'Thiếu tệp đính kèm.', 'VALIDATION')
    const check = validateUploadFile(file)
    if (!check.ok) return problem(400, check.message, 'INVALID_FILE')
    const stored = { id: newId('f'), name: file.name, size: file.size, contentType: file.type, uploadedBy: user.value.id, uploadedAt: nowIso() }
    db.attachments.push(stored)
    const ref: FileRef = { id: stored.id, name: stored.name, size: stored.size, contentType: stored.contentType }
    return HttpResponse.json(ref, { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/tasks/:taskId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const task = db.tasks.find((candidate) => candidate.id === params.taskId && candidate.clubId === params.clubId)
    if (!task) return problem(404, 'Không tìm thấy công việc.', 'TASK_NOT_FOUND')
    if (!canViewTask(task, user.value.id)) return problem(403, 'Bạn không có quyền với công việc này.', 'FORBIDDEN')
    const body = (await request.json()) as Partial<TaskTransitionRequest>
    const rule = body.action ? TRANSITIONS[body.action] : undefined
    if (!body.action || !rule) return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    // Thứ tự kiểm: quyền → version → trạng thái.
    const actorId = rule.actor === 'owner' ? task.ownerId : task.assignerId
    if (actorId !== user.value.id) {
      const message =
        body.action === 'CANCEL' ? 'Chỉ người giao việc được hủy việc.' : rule.actor === 'owner' ? 'Chỉ người chính được cập nhật và nộp kết quả.' : 'Chỉ người giao việc được nghiệm thu.'
      return problem(403, message, 'FORBIDDEN')
    }
    if (body.version !== task.version) {
      return problem(409, 'Công việc vừa được người khác cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    }
    const lockReason = eventLockReason(task)
    if (lockReason) return problem(422, lockReason, 'EVENT_READ_ONLY')
    if (!rule.from.includes(task.status)) {
      return problem(422, `Không thể thực hiện khi việc đang ở trạng thái ${statusLabel[task.status]}.`, 'INVALID_TRANSITION')
    }
    const note = (body.note ?? '').trim()
    const reason = (body.reason ?? '').trim()
    const attachmentIds = body.attachmentIds ?? []
    if (body.action === 'SUBMIT' && !note && attachmentIds.length === 0) {
      return problem(400, 'Cần ghi chú hoặc đính kèm kết quả khi nộp.', 'VALIDATION', [{ field: 'note', message: 'Nhập ghi chú hoặc đính kèm tệp.' }])
    }
    if (body.action === 'REQUEST_CHANGES' && reason.length < 5) {
      return problem(400, 'Nhận xét là bắt buộc khi yêu cầu làm lại.', 'VALIDATION', [{ field: 'reason', message: 'Nhập ít nhất 5 ký tự.' }])
    }
    if (body.action === 'CANCEL' && !reasonOk(reason)) return problem(400, 'Lý do hủy là bắt buộc.', 'VALIDATION', [reasonError])
    const at = nowIso()
    if (body.action === 'SUBMIT') task.submission = { note, attachmentIds, submittedAt: at }
    if (body.action === 'REQUEST_CHANGES') task.reviewComment = reason
    if (body.action === 'APPROVE') task.reviewComment = reason || task.reviewComment
    if (body.action === 'CANCEL') task.cancelReason = reason
    task.history.push({
      id: newId('h'),
      at,
      actorId: user.value.id,
      fromStatus: task.status,
      toStatus: rule.to,
      note: body.action === 'SUBMIT' ? note || null : reason || null,
    })
    task.status = rule.to
    task.version += 1
    const input = { clubId: task.clubId, category: 'TASK' as const, target: taskTarget(task.clubId, task.id), actorId: user.value.id }
    if (body.action === 'REQUEST_CHANGES') notify([task.ownerId], { ...input, title: `Việc bị trả lại: ${task.title}`, body: `Nhận xét: ${reason}` })
    if (body.action === 'CANCEL') notify([task.ownerId, ...task.collaboratorIds], { ...input, title: `Việc đã bị hủy: ${task.title}`, body: `Lý do: ${reason}` })
    return HttpResponse.json(toDetail(task, user.value.id))
  }),
]

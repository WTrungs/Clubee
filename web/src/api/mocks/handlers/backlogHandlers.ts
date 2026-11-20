import { http, HttpResponse } from 'msw'
import type { BacklogKind, BacklogStatus, ResolveBacklogRequest } from '@/features/member/model/backlogTypes'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db, type DbBacklogItem } from '../db'
import { appointBlock, backlogActions, backlogCandidates, backlogState, compareBacklogItems, eventOfPosition, positionOf, taskOf, toBacklogItem } from '../mockBacklog'
import { API, currentUser, networkDelay, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, personRef } from '../mockMembers'
import { notify, structureTarget, taskTarget } from '../mockNotifications'
import { can, forbidden } from '../mockAccess'
import { grantPosition, positionTitleOf, STANDING_ROLES } from '../mockPermissions'
import { assignSubcommitteeLead, leadsOtherSubcommittee, replaceEventLead } from '../mockStaffEvents'
import { recordTaskChange } from '../mockTasks'
import { nowIso } from '../mockTime'

const KINDS: BacklogKind[] = ['TASK', 'TASK_REVIEW', 'POSITION']
const STATUSES: BacklogStatus[] = ['OPEN', 'RESOLVED']

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const boardOnly = (clubId: string) => forbidden(clubId, 'MANAGE_MEMBERS', 'xem và xử lý tồn đọng của người đã rời CLB')

function findItem(params: Record<string, string | readonly string[] | undefined>): DbBacklogItem | undefined {
  return db.backlogItems.find((item) => item.id === params.itemId && item.clubId === params.clubId)
}

const settle = (item: DbBacklogItem, action: ResolveBacklogRequest['action'], userId: string | null, reason: string | null, by: string) => {
  item.resolution = { action, userId, reason, by, at: nowIso() }
  item.version += 1
}

/** FR-MEM-09: giao lại việc, đổi người nghiệm thu, chỉ định người giữ chức, hoặc ghi nhận không cần thay; trả lỗi hoặc null khi đã xử lý xong. */
function resolveItem(item: DbBacklogItem, body: Partial<ResolveBacklogRequest>, actorId: string): Response | null {
  const formerName = personRef(item.formerMemberId).fullName
  if (body.action === 'DISMISS') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      return problem(400, 'Vui lòng nhập lý do.', 'VALIDATION', [{ field: 'reason', message: `Nhập từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    settle(item, 'DISMISS', null, reason, actorId)
    return null
  }
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const invalidPerson = (message: string) => problem(400, 'Người được chọn không hợp lệ.', 'VALIDATION', [{ field: 'userId', message }])

  if (body.action === 'REASSIGN') {
    const task = taskOf(item)
    if (!task) return problem(404, 'Không tìm thấy công việc.', 'TASK_NOT_FOUND')
    if (!backlogCandidates(item, null).some((candidate) => candidate.id === userId)) {
      return invalidPerson(
        item.kind === 'TASK'
          ? 'Chỉ giao lại cho người còn thuộc phạm vi của việc: thành viên Thử việc, Chính thức của ban (không Tạm nghỉ), hoặc nhân sự còn trong tiểu ban.'
          : 'Người nghiệm thu phải là người quản lý phạm vi của việc: ban chủ nhiệm, trưởng, phó ban hoặc Trưởng BTC, trưởng tiểu ban.',
      )
    }
    const reason = `${formerName} đã rời CLB.`
    if (item.kind === 'TASK') {
      recordTaskChange(task, { actorId, field: 'OWNER', from: [task.ownerId], to: [userId], reason })
      // Người chính không đồng thời là người phối hợp, như luật giao việc (FR-TASK-01).
      if (task.collaboratorIds.includes(userId)) {
        const collaboratorIds = task.collaboratorIds.filter((id) => id !== userId)
        recordTaskChange(task, { actorId, field: 'COLLABORATORS', from: task.collaboratorIds, to: collaboratorIds, reason })
        task.collaboratorIds = collaboratorIds
      }
      task.ownerId = userId
    } else {
      recordTaskChange(task, { actorId, field: 'ASSIGNER', from: [task.assignerId], to: [userId], reason })
      task.assignerId = userId
    }
    task.version += 1
    settle(item, 'REASSIGN', userId, null, actorId)
    notify([userId], {
      clubId: item.clubId,
      category: 'TASK',
      title: item.kind === 'TASK' ? `Bạn được giao lại việc ${task.title}` : `Bạn nghiệm thu việc ${task.title} thay ${formerName}`,
      target: taskTarget(item.clubId, task.id),
      actorId,
    })
    return null
  }

  const position = positionOf(item)
  if (!position) return problem(404, 'Không tìm thấy chức vụ.', 'POSITION_NOT_FOUND')
  if (!backlogCandidates(item, null).some((candidate) => candidate.id === userId)) {
    if (position.role === 'SUBCOMMITTEE_LEAD' && leadsOtherSubcommittee(eventOfPosition(position)?.id ?? '', userId, position.scopeId)) {
      return problem(422, 'Người này đã là trưởng một tiểu ban khác trong sự kiện.', 'LEAD_TAKEN', [{ field: 'userId', message: 'Đã là trưởng tiểu ban khác.' }])
    }
    return invalidPerson(
      STANDING_ROLES.includes(position.role)
        ? 'Chức vụ thường trực chỉ cho thành viên Chính thức; trưởng, phó ban phải có ban chính là ban đó.'
        : 'Chỉ chọn thành viên Thử việc hoặc Chính thức của CLB.',
    )
  }
  if (STANDING_ROLES.includes(position.role)) {
    const granted = grantPosition({ userId, clubId: item.clubId, role: position.role, scopeId: position.scopeId, assignedBy: actorId })
    notify([userId], { clubId: item.clubId, category: 'POSITION', title: `Bạn được gán chức ${positionTitleOf(granted)}`, target: structureTarget(item.clubId), actorId })
  } else {
    const event = eventOfPosition(position)
    if (!event) return problem(404, 'Không tìm thấy sự kiện.', 'EVENT_NOT_FOUND')
    if (position.role === 'EVENT_LEAD') replaceEventLead(event, userId, actorId, `Thay ${formerName} đã rời CLB.`)
    else {
      const subcommittee = db.subcommittees.find((candidate) => candidate.id === position.scopeId)
      if (!subcommittee) return problem(404, 'Không tìm thấy tiểu ban.', 'NOT_FOUND')
      assignSubcommitteeLead(event, subcommittee, userId, actorId)
    }
  }
  settle(item, 'APPOINT', userId, null, actorId)
  return null
}

export const backlogHandlers = [
  http.get(`${API}/clubs/:clubId/backlog-items`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return boardOnly(clubId)
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const kind = url.searchParams.get('kind')
    const formerMemberId = url.searchParams.get('formerMemberId')
    if ((status !== null && !STATUSES.includes(status as BacklogStatus)) || (kind !== null && !KINDS.includes(kind as BacklogKind))) {
      return problem(400, 'Bộ lọc tồn đọng không hợp lệ.', 'VALIDATION')
    }
    const items = db.backlogItems
      .filter((item) => item.clubId === clubId && (formerMemberId === null || item.formerMemberId === formerMemberId))
      .filter((item) => (kind === null || item.kind === kind) && (status === null || backlogState(item).status === status))
      .toSorted(compareBacklogItems)
    const page = paginate(items, url, 50)
    return HttpResponse.json({ ...page, content: page.content.map((item) => toBacklogItem(item, user.value.id)) })
  }),

  http.get(`${API}/clubs/:clubId/backlog-items/:itemId/candidates`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return boardOnly(clubId)
    const item = findItem(params)
    if (!item) return problem(404, 'Không tìm thấy mục tồn đọng.', 'BACKLOG_NOT_FOUND')
    return HttpResponse.json(backlogCandidates(item, new URL(request.url).searchParams.get('q')))
  }),

  http.post(`${API}/clubs/:clubId/backlog-items/:itemId/resolution`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return boardOnly(clubId)
    const item = findItem(params)
    if (!item) return problem(404, 'Không tìm thấy mục tồn đọng.', 'BACKLOG_NOT_FOUND')
    const body = (await request.json()) as Partial<ResolveBacklogRequest>
    if (body.version !== item.version) return problem(409, 'Mục tồn đọng vừa được người khác xử lý. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    const state = backlogState(item)
    if (state.status === 'RESOLVED') return problem(422, state.note ? `Mục này đã xong: ${state.note}` : 'Mục này đã được xử lý.', 'BACKLOG_RESOLVED')
    const action = body.action
    if (action === undefined || !backlogActions(item, user.value.id).includes(action)) {
      const blocked = action === 'APPOINT' ? appointBlock(item, user.value.id) : null
      if (blocked) return problem(blocked.status, blocked.message, blocked.code)
      return problem(400, 'Thao tác không hợp lệ với loại mục này.', 'VALIDATION', [{ field: 'action', message: 'Chọn thao tác phù hợp với loại mục.' }])
    }
    const failure = resolveItem(item, body, user.value.id)
    if (failure) return failure
    return HttpResponse.json(toBacklogItem(item, user.value.id))
  }),
]

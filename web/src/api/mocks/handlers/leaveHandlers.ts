import { http, HttpResponse } from 'msw'
import type { LeaveDecisionRequest, LeaveRequestQuery, MyMembershipTransitionRequest } from '@/features/member/model/memberTypes'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db, type DbLeaveRequest, type DbMembership } from '../db'
import { can, forbidden, holdersOf } from '../mockAccess'
import { API, currentUser, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub, membershipOf, personRef, recordMembershipChange } from '../mockMembers'
import { latestLeaveRequestOf, leaveBlockers, putOnLeaveBlock, resignBlockers, resignFromClub, toLeaveRequest, toMyMembership } from '../mockMembership'
import { membersTarget, notify } from '../mockNotifications'
import { nowIso } from '../mockTime'

const STATUS_FILTERS: Array<NonNullable<LeaveRequestQuery['status']>> = ['PENDING', 'DECIDED']

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const clubNameOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.name ?? 'CLB'
/** Body JSON có thể chứa kiểu bất kỳ; giá trị không phải chuỗi coi như rỗng. */
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const reasonError = (field: string, label: string) =>
  problem(400, `Vui lòng nhập ${label}.`, 'VALIDATION', [{ field, message: `Nhập từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
const validReason = (value: string) => value.length >= REASON_MIN && value.length <= REASON_MAX

/** Tư cách đang sinh hoạt của người gọi ở CLB (Thử việc, Chính thức, Tạm nghỉ); người Chờ duyệt hoặc đã rời không có trang này. */
function ownMembership(userId: string, clubId: string): DbMembership | null {
  if (!canAccessClub(userId, clubId)) return null
  return membershipOf(userId, clubId) ?? null
}

/** Báo những người đang có quyền quản lý thành viên, trừ chính người gửi; `tab` là tab trang Thành viên cần mở. */
function notifyManagers(clubId: string, actorId: string, title: string, { body, tab = null }: { body?: string; tab?: string | null } = {}) {
  notify(holdersOf(clubId, 'MANAGE_MEMBERS'), { clubId, category: 'MEMBERSHIP', title, body, target: membersTarget(clubId, tab), actorId })
}

export const leaveHandlers = [
  http.get(`${API}/clubs/:clubId/my-membership`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const membership = ownMembership(user.value.id, String(params.clubId))
    if (!membership) return notMember()
    return HttpResponse.json(toMyMembership(membership))
  }),

  http.post(`${API}/clubs/:clubId/my-membership/leave-requests`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const membership = ownMembership(user.value.id, clubId)
    if (!membership) return notMember()
    const reason = text(((await request.json()) as { reason?: unknown }).reason)
    if (latestLeaveRequestOf(membership.id)?.status === 'PENDING') {
      return problem(409, 'Bạn đã có yêu cầu tạm nghỉ đang chờ ban chủ nhiệm duyệt.', 'LEAVE_REQUEST_EXISTS')
    }
    if (membership.status !== 'ACTIVE') return problem(422, 'Chỉ thành viên Chính thức mới xin tạm nghỉ được.', 'INVALID_TRANSITION')
    const blockers = leaveBlockers(membership)
    if (blockers.length > 0) return problem(422, `Chưa xin tạm nghỉ được. ${blockers.join(' ')}`, 'HOLDS_STANDING_POSITION')
    if (!validReason(reason)) return reasonError('reason', 'lý do xin tạm nghỉ')
    const created: DbLeaveRequest = {
      id: newId('lr'),
      clubId,
      membershipId: membership.id,
      userId: user.value.id,
      reason,
      status: 'PENDING',
      createdAt: nowIso(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      version: 1,
    }
    db.leaveRequests.push(created)
    notifyManagers(clubId, user.value.id, `${personRef(user.value.id).fullName} xin tạm nghỉ`, { body: `Lý do: ${reason}`, tab: 'leave' })
    return HttpResponse.json(toMyMembership(membership), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/my-membership/leave-requests/:requestId/withdrawal`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const membership = ownMembership(user.value.id, clubId)
    if (!membership) return notMember()
    const leave = db.leaveRequests.find((candidate) => candidate.id === params.requestId && candidate.membershipId === membership.id)
    if (!leave) return problem(404, 'Không tìm thấy yêu cầu tạm nghỉ.', 'LEAVE_REQUEST_NOT_FOUND')
    const body = (await request.json()) as { version?: unknown }
    if (body.version !== leave.version) return problem(409, 'Yêu cầu vừa được ban chủ nhiệm xử lý. Tải lại để xem kết quả.', 'VERSION_CONFLICT')
    if (leave.status !== 'PENDING') return problem(422, 'Yêu cầu này đã được xử lý nên không rút được.', 'REQUEST_CLOSED')
    Object.assign(leave, { status: 'WITHDRAWN', decidedBy: user.value.id, decidedAt: nowIso(), version: leave.version + 1 })
    return HttpResponse.json(toMyMembership(membership))
  }),

  http.post(`${API}/clubs/:clubId/my-membership/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const membership = ownMembership(user.value.id, clubId)
    if (!membership) return notMember()
    const body = (await request.json()) as Partial<MyMembershipTransitionRequest>
    if (body.action !== 'RETURN' && body.action !== 'RESIGN') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    if (body.version !== membership.version) {
      return problem(409, 'Tư cách của bạn vừa được ban chủ nhiệm cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    }
    const name = personRef(user.value.id).fullName

    if (body.action === 'RETURN') {
      // Quay lại sau tạm nghỉ là về Chính thức, không gia nhập lại (FR-MEM-07, ST-MEM).
      if (membership.status !== 'ON_LEAVE') return problem(422, 'Chỉ người đang Tạm nghỉ mới quay lại sinh hoạt được.', 'INVALID_TRANSITION')
      recordMembershipChange(membership, { actorId: user.value.id, fromStatus: 'ON_LEAVE', toStatus: 'ACTIVE', reason: null })
      membership.status = 'ACTIVE'
      membership.version += 1
      notifyManagers(clubId, user.value.id, `${name} đã quay lại sinh hoạt`)
      return HttpResponse.json(toMyMembership(membership))
    }

    const blockers = resignBlockers(membership)
    if (blockers.length > 0) {
      return problem(
        422,
        'Bạn còn khoản chưa bàn giao nên chưa rời CLB được. Hoàn tất hoặc nhờ ban chủ nhiệm giao lại trước.',
        'RESIGN_BLOCKED',
        blockers.map((blocker) => ({ field: 'blockers', message: blocker.title })),
      )
    }
    const reason = text(body.reason)
    if (!validReason(reason)) return reasonError('reason', 'lý do xin rời')
    resignFromClub(membership, reason)
    notifyManagers(clubId, user.value.id, `${name} đã rời ${clubNameOf(clubId)}`, { body: `Lý do: ${reason}` })
    return HttpResponse.json(toMyMembership(membership))
  }),

  http.get(`${API}/clubs/:clubId/leave-requests`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return forbidden(clubId, 'MANAGE_MEMBERS', 'xem yêu cầu tạm nghỉ')
    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status = STATUS_FILTERS.find((candidate) => candidate === statusParam) ?? 'PENDING'
    const rows = db.leaveRequests
      .filter((leave) => leave.clubId === clubId && (status === 'PENDING' ? leave.status === 'PENDING' : leave.status !== 'PENDING'))
      // Chờ duyệt: cũ trước để xử lý theo thứ tự gửi; đã xử lý: mới nhất trước.
      .toSorted((a, b) => (status === 'PENDING' ? a.createdAt.localeCompare(b.createdAt) : (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')) || a.id.localeCompare(b.id))
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map((leave) => toLeaveRequest(leave, user.value.id)) })
  }),

  http.post(`${API}/clubs/:clubId/leave-requests/:requestId/decision`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!can(user.value.id, clubId, 'MANAGE_MEMBERS')) return forbidden(clubId, 'MANAGE_MEMBERS', 'duyệt yêu cầu tạm nghỉ')
    const leave = db.leaveRequests.find((candidate) => candidate.id === params.requestId && candidate.clubId === clubId)
    const membership = db.memberships.find((candidate) => candidate.id === leave?.membershipId)
    if (!leave || !membership) return problem(404, 'Không tìm thấy yêu cầu tạm nghỉ.', 'LEAVE_REQUEST_NOT_FOUND')
    const body = (await request.json()) as Partial<LeaveDecisionRequest>
    if (body.action !== 'APPROVE' && body.action !== 'REJECT') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    if (body.version !== leave.version) return problem(409, 'Yêu cầu vừa được người khác xử lý. Tải lại để xem kết quả.', 'VERSION_CONFLICT')
    if (leave.status !== 'PENDING') return problem(422, 'Yêu cầu này đã được xử lý.', 'REQUEST_CLOSED')
    if (leave.userId === user.value.id) return problem(422, 'Bạn không tự duyệt yêu cầu tạm nghỉ của mình được; người khác trong ban chủ nhiệm sẽ duyệt.', 'SELF_TRANSITION')
    const name = personRef(leave.userId).fullName
    const now = nowIso()

    if (body.action === 'REJECT') {
      const note = text(body.note)
      if (!validReason(note)) return reasonError('note', 'lý do từ chối')
      Object.assign(leave, { status: 'REJECTED', decidedBy: user.value.id, decidedAt: now, decisionNote: note, version: leave.version + 1 })
      notify([leave.userId], {
        clubId,
        category: 'MEMBERSHIP',
        title: `Yêu cầu tạm nghỉ ở ${clubNameOf(clubId)} chưa được chấp nhận`,
        body: `Lý do: ${note}`,
        target: membersTarget(clubId),
        actorId: user.value.id,
      })
      return HttpResponse.json(toLeaveRequest(leave, user.value.id))
    }

    if (membership.status !== 'ACTIVE') return problem(422, `${name} không còn là thành viên Chính thức nên không cho tạm nghỉ được.`, 'INVALID_TRANSITION')
    const blocked = putOnLeaveBlock(membership, name)
    if (blocked) return blocked
    recordMembershipChange(membership, { actorId: user.value.id, fromStatus: 'ACTIVE', toStatus: 'ON_LEAVE', reason: leave.reason, at: now })
    membership.status = 'ON_LEAVE'
    membership.version += 1
    Object.assign(leave, { status: 'APPROVED', decidedBy: user.value.id, decidedAt: now, decisionNote: null, version: leave.version + 1 })
    notify([leave.userId], {
      clubId,
      category: 'MEMBERSHIP',
      title: `Yêu cầu tạm nghỉ ở ${clubNameOf(clubId)} đã được duyệt`,
      target: membersTarget(clubId),
      actorId: user.value.id,
    })
    return HttpResponse.json(toLeaveRequest(leave, user.value.id))
  }),
]

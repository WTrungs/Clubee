import { http, HttpResponse } from 'msw'
import type { AccountStatus, AccountTransitionRequest, AdminAccount, AdminAccountAction, AdminMetrics } from '@/features/account/model/adminTypes'
import type { TransferCandidate, TransferDecisionRequest } from '@/features/account/model/presidencyTransferTypes'
import { ADMIN_EMAIL_QUERY_MIN as EMAIL_QUERY_MIN } from '@/shared/lib/accountRules'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { TRANSFER_NOTE_MAX, TRANSFER_NOTE_MIN } from '@/shared/lib/transferRules'
import { db, type DbUser } from '../db'
import { audit } from '../mockAudit'
import { API, currentUser, networkDelay, paginate, problem, writer, type Guarded } from '../mockHttp'
import { departmentNameOf, membershipOf, personRef, ROSTER_STATUSES } from '../mockMembers'
import { notify, structureTarget } from '../mockNotifications'
import { endPositions, grantPosition, hasPosition, isPositionOpen } from '../mockPermissions'
import { nowIso } from '../mockTime'
import { boardCheck, toAdminTransferRequest } from '../mockTransfers'

const DAY_MS = 24 * 60 * 60 * 1000

/** SRS 3.4: route Admin chỉ dành cho tài khoản Admin. */
function requireAdmin(user: Guarded<DbUser>): Guarded<DbUser> {
  if (!user.ok) return user
  if (user.value.accountType !== 'ADMIN') return { ok: false, response: problem(403, 'Chỉ quản trị hệ thống được dùng chức năng này.', 'ADMIN_ONLY') }
  return user
}

const clubCountOf = (userId: string) => new Set(db.memberships.filter((membership) => membership.userId === userId && ROSTER_STATUSES.includes(membership.status)).map((membership) => membership.clubId)).size

function accountActions(target: DbUser, adminId: string): AdminAccountAction[] {
  const actions: AdminAccountAction[] = []
  if (target.status === 'ACTIVE' && target.accountType === 'USER' && target.id !== adminId) actions.push('LOCK')
  if (target.status === 'LOCKED') actions.push('UNLOCK')
  if (target.status === 'ACTIVE') actions.push('SEND_PASSWORD_RESET')
  return actions
}

/** Không trả SĐT, ngày sinh hay tên CLB (SRS 3.4). */
function toAdminAccount(target: DbUser, adminId: string): AdminAccount {
  return {
    id: target.id,
    fullName: target.fullName,
    email: target.email,
    status: target.status,
    accountType: target.accountType,
    createdAt: target.createdAt,
    lastLoginAt: target.lastLoginAt,
    clubCount: clubCountOf(target.id),
    lockReason: target.lockReason,
    lockedAt: target.lockedAt,
    allowedActions: accountActions(target, adminId),
    version: target.version,
  }
}

const snapshot = (target: DbUser) => ({ status: target.status, lockReason: target.lockReason })

/** NFR-SEC-06: Admin không là thành viên CLB nào nên mọi route CLB đều từ chối; tài khoản thường đi tiếp tới handler thật. */
function blockAdmin() {
  const user = currentUser()
  if (user.ok && user.value.accountType === 'ADMIN') {
    return problem(403, 'Tài khoản quản trị hệ thống không dùng các chức năng của CLB.', 'ADMIN_ACCOUNT')
  }
  return undefined
}

/** Đặt trước mọi handler khác để chặn Admin ở route CLB và lời mời. */
export const adminGuardHandlers = [
  http.all(`${API}/clubs`, blockAdmin),
  http.all(`${API}/clubs/*`, blockAdmin),
  http.all(`${API}/invitations/*`, blockAdmin),
]

export const adminHandlers = [
  http.get(`${API}/admin/metrics`, async () => {
    await networkDelay()
    const user = requireAdmin(currentUser())
    if (!user.ok) return user.response
    const users = db.users.filter((candidate) => candidate.accountType === 'USER')
    const count = (status: AccountStatus) => users.filter((candidate) => candidate.status === status).length
    const since = Date.now() - 30 * DAY_MS
    const metrics: AdminMetrics = {
      clubCount: db.clubs.length,
      accounts: { ACTIVE: count('ACTIVE'), LOCKED: count('LOCKED'), PENDING_VERIFICATION: count('PENDING_VERIFICATION') },
      activeLast30Days: users.filter((candidate) => candidate.lastLoginAt !== null && Date.parse(candidate.lastLoginAt) >= since).length,
      pendingTransferRequests: db.transferRequests.filter((transfer) => transfer.status === 'PENDING').length,
      systemErrorsLast24h: 0,
      generatedAt: nowIso(),
    }
    return HttpResponse.json(metrics)
  }),

  http.get(`${API}/admin/accounts`, async ({ request }) => {
    await networkDelay()
    const user = requireAdmin(currentUser())
    if (!user.ok) return user.response
    const url = new URL(request.url)
    const email = (url.searchParams.get('email') ?? '').trim().toLowerCase()
    // Không liệt kê toàn bộ người dùng: bắt buộc nhập một phần email.
    if (email.length < EMAIL_QUERY_MIN) {
      return problem(400, `Nhập ít nhất ${EMAIL_QUERY_MIN} ký tự của email để tìm.`, 'VALIDATION', [{ field: 'email', message: `Nhập ít nhất ${EMAIL_QUERY_MIN} ký tự.` }])
    }
    const rows = db.users.filter((candidate) => candidate.email.toLowerCase().includes(email)).toSorted((a, b) => a.email.localeCompare(b.email))
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map((target) => toAdminAccount(target, user.value.id)) })
  }),

  http.post(`${API}/admin/accounts/:userId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = requireAdmin(writer(request))
    if (!user.ok) return user.response
    const target = db.users.find((candidate) => candidate.id === String(params.userId))
    if (!target) return problem(404, 'Không tìm thấy tài khoản.', 'ACCOUNT_NOT_FOUND')
    const body = (await request.json()) as Partial<AccountTransitionRequest>
    if (body.action !== 'LOCK' && body.action !== 'UNLOCK') {
      return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION', [{ field: 'action', message: 'Chọn khóa hoặc mở khóa.' }])
    }
    if (body.version !== target.version) return problem(409, 'Tài khoản vừa được thay đổi. Tìm lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    if (body.action === 'LOCK') {
      if (target.id === user.value.id) return problem(422, 'Không tự khóa tài khoản của mình.', 'SELF_LOCK')
      if (target.accountType === 'ADMIN') return problem(422, 'Không khóa tài khoản quản trị hệ thống khác ở đây.', 'ADMIN_TARGET')
      if (target.status === 'PENDING_VERIFICATION') return problem(422, 'Tài khoản chưa xác thực email nên chưa dùng được, không cần khóa.', 'INVALID_TRANSITION')
      if (target.status === 'LOCKED') return problem(422, 'Tài khoản đã bị khóa.', 'INVALID_TRANSITION')
    } else if (target.status !== 'LOCKED') {
      return problem(422, 'Tài khoản không ở trạng thái Bị khóa.', 'INVALID_TRANSITION')
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      return problem(400, 'Vui lòng nhập lý do.', 'VALIDATION', [{ field: 'reason', message: `Nhập từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    const before = snapshot(target)
    const now = nowIso()
    if (body.action === 'LOCK') Object.assign(target, { status: 'LOCKED', lockReason: reason, lockedAt: now, lockedBy: user.value.id })
    else Object.assign(target, { status: 'ACTIVE', lockReason: null, lockedAt: null, lockedBy: null })
    target.version += 1
    audit({ actorId: user.value.id, clubId: null, action: body.action === 'LOCK' ? 'LOCK_ACCOUNT' : 'UNLOCK_ACCOUNT', objectType: 'ACCOUNT', objectId: target.id, before, after: snapshot(target), reason })
    return HttpResponse.json(toAdminAccount(target, user.value.id))
  }),

  http.post(`${API}/admin/accounts/:userId/password-reset-links`, async ({ request, params }) => {
    await networkDelay()
    const user = requireAdmin(writer(request))
    if (!user.ok) return user.response
    const target = db.users.find((candidate) => candidate.id === String(params.userId))
    if (!target) return problem(404, 'Không tìm thấy tài khoản.', 'ACCOUNT_NOT_FOUND')
    if (target.status === 'LOCKED') return problem(422, 'Tài khoản đang bị khóa. Mở khóa trước khi gửi liên kết đặt mật khẩu.', 'ACCOUNT_LOCKED')
    if (target.status === 'PENDING_VERIFICATION') return problem(422, 'Tài khoản chưa xác thực email nên chưa đặt lại mật khẩu được.', 'INVALID_TRANSITION')
    // Mock không gửi thư (IF-03 thuộc máy chủ); chỉ ghi nhật ký.
    audit({ actorId: user.value.id, clubId: null, action: 'SEND_PASSWORD_RESET', objectType: 'ACCOUNT', objectId: target.id, before: null, after: null, reason: null })
    return new HttpResponse(null, { status: 202 })
  }),

  http.get(`${API}/admin/presidency-transfer-requests`, async ({ request }) => {
    await networkDelay()
    const user = requireAdmin(currentUser())
    if (!user.ok) return user.response
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'PENDING'
    if (status !== 'PENDING' && status !== 'HANDLED') {
      return problem(400, 'Trạng thái lọc không hợp lệ.', 'VALIDATION', [{ field: 'status', message: 'Trạng thái lọc không hợp lệ.' }])
    }
    const rows = db.transferRequests
      .filter((transfer) => (status === 'PENDING' ? transfer.status === 'PENDING' : transfer.status !== 'PENDING'))
      .toSorted((a, b) => (status === 'PENDING' ? a.createdAt.localeCompare(b.createdAt) : (b.handledAt ?? '').localeCompare(a.handledAt ?? '')))
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map(toAdminTransferRequest) })
  }),

  http.get(`${API}/admin/presidency-transfer-requests/:requestId/candidates`, async ({ params }) => {
    await networkDelay()
    const user = requireAdmin(currentUser())
    if (!user.ok) return user.response
    const transfer = db.transferRequests.find((candidate) => candidate.id === String(params.requestId))
    if (!transfer) return problem(404, 'Không tìm thấy yêu cầu.', 'TRANSFER_REQUEST_NOT_FOUND')
    // R-04: Admin chỉ xem thành viên của đúng CLB có yêu cầu, và chỉ khi yêu cầu còn chờ.
    if (transfer.status !== 'PENDING') return problem(422, 'Yêu cầu đã được xử lý nên không xem danh sách thành viên được nữa.', 'TRANSFER_NOT_PENDING')
    const candidates: TransferCandidate[] = db.memberships
      // Chủ nhiệm đang giữ chức không nhận lại chính chức đó nên không đưa vào danh sách.
      .filter((membership) => membership.clubId === transfer.clubId && membership.status === 'ACTIVE' && !hasPosition(membership.userId, 'PRESIDENT', transfer.clubId))
      .map((membership) => ({ id: membership.userId, fullName: personRef(membership.userId).fullName, departmentName: departmentNameOf(membership.userId, transfer.clubId), joinedOn: membership.joinedOn }))
      .toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
    audit({ actorId: user.value.id, clubId: transfer.clubId, action: 'VIEW_TRANSFER_CANDIDATES', objectType: 'TRANSFER_REQUEST', objectId: transfer.id, before: null, after: null, reason: null })
    return HttpResponse.json(candidates)
  }),

  http.post(`${API}/admin/presidency-transfer-requests/:requestId/decision`, async ({ request, params }) => {
    await networkDelay()
    const user = requireAdmin(writer(request))
    if (!user.ok) return user.response
    const transfer = db.transferRequests.find((candidate) => candidate.id === String(params.requestId))
    if (!transfer) return problem(404, 'Không tìm thấy yêu cầu.', 'TRANSFER_REQUEST_NOT_FOUND')
    const body = (await request.json()) as Partial<TransferDecisionRequest>
    if (body.action !== 'APPROVE' && body.action !== 'REJECT') {
      return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION', [{ field: 'action', message: 'Chọn chuyển quyền hoặc từ chối.' }])
    }
    if (body.version !== transfer.version) return problem(409, 'Yêu cầu vừa thay đổi. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    if (transfer.status !== 'PENDING') return problem(422, 'Yêu cầu đã được xử lý hoặc đã bị hủy.', 'TRANSFER_NOT_PENDING')
    const club = db.clubs.find((candidate) => candidate.id === transfer.clubId)
    if (!club) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
    // Kiểm lại lúc xử lý: ban chủ nhiệm đăng nhập lại thì chỉ còn từ chối được.
    if (body.action === 'APPROVE' && !boardCheck(club.id).boardInactive) {
      return problem(422, 'Ban chủ nhiệm đã hoạt động trở lại nên không chuyển quyền được; chỉ từ chối được yêu cầu này.', 'BOARD_ACTIVE')
    }
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const newPresidentId = typeof body.newPresidentId === 'string' ? body.newPresidentId : ''
    const errors = [
      ...(note.length < TRANSFER_NOTE_MIN || note.length > TRANSFER_NOTE_MAX ? [{ field: 'note', message: `Nhập từ ${TRANSFER_NOTE_MIN} đến ${TRANSFER_NOTE_MAX} ký tự.` }] : []),
      ...(body.action === 'APPROVE' && membershipOf(newPresidentId, club.id)?.status !== 'ACTIVE'
        ? [{ field: 'newPresidentId', message: 'Chọn một thành viên Chính thức của CLB này.' }]
        : []),
      ...(body.action === 'APPROVE' && hasPosition(newPresidentId, 'PRESIDENT', club.id) ? [{ field: 'newPresidentId', message: 'Người này đang là Chủ nhiệm.' }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Thông tin xử lý chưa hợp lệ.', 'VALIDATION', errors)
    const now = nowIso()
    if (body.action === 'REJECT') {
      Object.assign(transfer, { status: 'REJECTED', handledBy: user.value.id, handledAt: now, decisionNote: note, version: transfer.version + 1 })
      audit({ actorId: user.value.id, clubId: club.id, action: 'REJECT_PRESIDENCY_TRANSFER', objectType: 'TRANSFER_REQUEST', objectId: transfer.id, before: { status: 'PENDING' }, after: { status: 'REJECTED' }, reason: note })
      notify([transfer.requesterId], { clubId: club.id, category: 'POSITION', title: 'Yêu cầu chuyển quyền Chủ nhiệm bị từ chối', body: `Lý do: ${note}`, target: structureTarget(club.id), actorId: user.value.id })
      return HttpResponse.json(toAdminTransferRequest(transfer))
    }
    // Ngoại lệ của Admin (FR-ACC-08): không xét nhiệm kỳ quá hạn hay đang bàn giao; chỉ thu hồi Chủ nhiệm cũ, các chức khác giữ nguyên.
    const before = { presidents: db.positions.filter((position) => position.clubId === club.id && position.role === 'PRESIDENT' && isPositionOpen(position)).map((position) => position.userId) }
    endPositions((position) => position.clubId === club.id && position.role === 'PRESIDENT', { reason: `Quản trị hệ thống chuyển quyền Chủ nhiệm: ${note}` })
    grantPosition({ userId: newPresidentId, clubId: club.id, role: 'PRESIDENT', scopeId: club.id, assignedBy: user.value.id })
    Object.assign(transfer, { status: 'APPROVED', handledBy: user.value.id, handledAt: now, newPresidentId, decisionNote: note, version: transfer.version + 1 })
    audit({ actorId: user.value.id, clubId: club.id, action: 'APPROVE_PRESIDENCY_TRANSFER', objectType: 'TRANSFER_REQUEST', objectId: transfer.id, before, after: { presidents: [newPresidentId] }, reason: note })
    const members = db.memberships.filter((membership) => membership.clubId === club.id && ROSTER_STATUSES.includes(membership.status)).map((membership) => membership.userId)
    notify(members, {
      clubId: club.id,
      category: 'POSITION',
      title: `${personRef(newPresidentId).fullName} là Chủ nhiệm mới của ${club.name}`,
      body: `Quản trị hệ thống chuyển quyền theo yêu cầu của thành viên vì ban chủ nhiệm không hoạt động. Lý do: ${note}`,
      target: structureTarget(club.id),
      actorId: user.value.id,
    })
    return HttpResponse.json(toAdminTransferRequest(transfer))
  }),
]

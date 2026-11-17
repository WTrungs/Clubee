import { http, HttpResponse } from 'msw'
import { TRANSFER_REASON_MAX, TRANSFER_REASON_MIN } from '@/shared/lib/transferRules'
import { db } from '../db'
import { API, currentUser, networkDelay, newId, problem, writer } from '../mockHttp'
import { canAccessClub, membershipOf } from '../mockMembers'
import { boardCheck, pendingTransferOf, toMemberTransferRequest, transferOverview, type DbTransferRequest } from '../mockTransfers'
import { nowIso } from '../mockTime'

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')

/** FR-ACC-08 phía thành viên: xem điều kiện, gửi và hủy yêu cầu chuyển quyền Chủ nhiệm. */
export const transferHandlers = [
  http.get(`${API}/clubs/:clubId/presidency-transfer-request`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    return HttpResponse.json(transferOverview(clubId, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/presidency-transfer-requests`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (membershipOf(user.value.id, clubId)?.status !== 'ACTIVE') {
      return problem(403, 'Chỉ thành viên Chính thức được yêu cầu chuyển quyền Chủ nhiệm.', 'FORBIDDEN')
    }
    if (pendingTransferOf(clubId)) return problem(409, 'CLB đã có một yêu cầu chuyển quyền đang chờ quản trị hệ thống xử lý.', 'TRANSFER_REQUEST_EXISTS')
    const check = boardCheck(clubId)
    if (!check.boardInactive) {
      return problem(422, `Ban chủ nhiệm vẫn hoạt động trong ${check.inactiveDays} ngày qua nên chưa yêu cầu chuyển quyền được.`, 'BOARD_ACTIVE')
    }
    const body = (await request.json()) as { reason?: unknown }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < TRANSFER_REASON_MIN || reason.length > TRANSFER_REASON_MAX) {
      return problem(400, 'Vui lòng nêu lý do.', 'VALIDATION', [{ field: 'reason', message: `Nhập từ ${TRANSFER_REASON_MIN} đến ${TRANSFER_REASON_MAX} ký tự.` }])
    }
    const created: DbTransferRequest = {
      id: newId('tr'),
      clubId,
      requesterId: user.value.id,
      reason,
      status: 'PENDING',
      checkAtRequest: check,
      createdAt: nowIso(),
      handledBy: null,
      handledAt: null,
      newPresidentId: null,
      decisionNote: null,
      version: 1,
    }
    db.transferRequests.push(created)
    return HttpResponse.json(toMemberTransferRequest(created, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/presidency-transfer-requests/:requestId/cancellation`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    const transfer = db.transferRequests.find((candidate) => candidate.id === String(params.requestId) && candidate.clubId === clubId)
    if (!transfer) return problem(404, 'Không tìm thấy yêu cầu.', 'TRANSFER_REQUEST_NOT_FOUND')
    if (transfer.requesterId !== user.value.id) return problem(403, 'Chỉ người gửi được hủy yêu cầu này.', 'FORBIDDEN')
    const body = (await request.json()) as { version?: unknown }
    if (body.version !== transfer.version) return problem(409, 'Yêu cầu vừa thay đổi. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    if (transfer.status !== 'PENDING') return problem(422, 'Yêu cầu đã được xử lý nên không hủy được.', 'TRANSFER_NOT_PENDING')
    Object.assign(transfer, { status: 'CANCELLED', handledAt: nowIso(), version: transfer.version + 1 })
    return HttpResponse.json(toMemberTransferRequest(transfer, user.value.id))
  }),
]

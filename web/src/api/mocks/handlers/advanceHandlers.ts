import { http, HttpResponse } from 'msw'
import type { AdvanceTransitionRequest, ProposeAdvanceRequest } from '@/features/finance/model/advanceTypes'
import { EXPENSE_CATEGORIES } from '@/features/finance/model/financeTypes'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { db, type DbTransaction } from '../db'
import { forbidden } from '../mockAccess'
import {
  ADVANCE_SETTLE_MAX_DAYS,
  advanceTarget,
  canListAdvances,
  canViewAdvance,
  fundOfAdvance,
  isAdvanceOverdue,
  overdueAdvanceOf,
  toAdvanceDetail,
  toAdvanceSummary,
} from '../mockAdvances'
import { approversOf, canApproveIn, canProposeIn, canReachClubFinance, fundBalance, fundName, keepsLedger, ledgerKeepersOf } from '../mockFinance'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { personRef } from '../mockMembers'
import { notify } from '../mockNotifications'
import { isRealDate, nowIso, shiftDate, vnToday } from '../mockTime'
import type { DbAdvance } from '../seed/advanceSeed'

// FR-FIN-07: đề xuất, duyệt hoặc từ chối, ghi Đã ứng. Quyền theo bảng ở kế hoạch đợt 7: đề xuất qua `canProposeIn`, duyệt qua
// `canApproveIn`, ghi Đã ứng cần `RECORD_LEDGER`; người đề xuất không tự duyệt.

const MAX_AMOUNT = 1_000_000_000
const PURPOSE_MIN = 5
const PURPOSE_MAX = 500

const statusLabel: Record<DbAdvance['status'], string> = {
  PROPOSED: 'Đề xuất',
  APPROVED: 'Đã duyệt',
  DISBURSED: 'Đã ứng',
  PARTIALLY_SETTLED: 'Quyết toán một phần',
  SETTLED: 'Đã quyết toán',
  REJECTED: 'Bị từ chối',
}

function clubGate(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canReachClubFinance(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  return null
}

const findAdvance = (clubId: string, advanceId: unknown) => db.advances.find((advance) => advance.id === advanceId && advance.clubId === clubId)
const newestFirst = (a: DbAdvance, b: DbAdvance) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

/** Kiểm nội dung đề xuất (400 theo ô); hạn quyết toán từ hôm nay tới `ADVANCE_SETTLE_MAX_DAYS` ngày. */
function proposalErrors(body: Partial<ProposeAdvanceRequest>) {
  const today = vnToday()
  const amount = body.amount
  const purpose = (body.purpose ?? '').trim()
  return [
    ...(typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT
      ? [{ field: 'amount', message: 'Số tiền là số nguyên dương, tối đa 1.000.000.000 đ (BR-FIN-04).' }]
      : []),
    ...(purpose.length < PURPOSE_MIN || purpose.length > PURPOSE_MAX ? [{ field: 'purpose', message: `Mục đích cần từ ${PURPOSE_MIN} đến ${PURPOSE_MAX} ký tự.` }] : []),
    ...(!EXPENSE_CATEGORIES.some((category) => category === body.category) ? [{ field: 'category', message: 'Chọn hạng mục chi.' }] : []),
    ...(!isRealDate(body.settleBy) || body.settleBy < today || body.settleBy > shiftDate(today, ADVANCE_SETTLE_MAX_DAYS)
      ? [{ field: 'settleBy', message: `Hạn quyết toán từ hôm nay đến tối đa ${ADVANCE_SETTLE_MAX_DAYS} ngày tới.` }]
      : []),
  ]
}

/** Ghi Đã ứng: sinh khoản chi Đã ghi sổ gắn `advanceId`, người duyệt là người duyệt tạm ứng (dùng cho R-01 ở báo cáo). */
function disburse(advance: DbAdvance, userId: string, disbursedOn: string): void {
  const now = nowIso()
  const transaction: DbTransaction = {
    id: newId('tx'),
    clubId: advance.clubId,
    fundId: advance.fundId,
    type: 'EXPENSE',
    direction: 'OUT',
    amount: advance.amount,
    category: advance.category,
    description: `Tạm ứng: ${advance.purpose} (${personRef(advance.requesterId).fullName})`,
    occurredOn: disbursedOn,
    status: 'POSTED',
    proposerId: advance.requesterId,
    approverId: advance.approverId,
    posterId: userId,
    attachmentIds: [],
    originalId: null,
    targetFundId: null,
    rejectionReason: null,
    createdAt: now,
    decidedAt: advance.decidedAt,
    postedAt: now,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    version: 1,
    advanceId: advance.id,
  }
  db.transactions.push(transaction)
  Object.assign(advance, { status: 'DISBURSED', disbursedBy: userId, disbursedOn, disbursementTxId: transaction.id })
}

export const advanceHandlers = [
  http.get(`${API}/clubs/:clubId/advances`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const url = new URL(request.url)
    const fundId = url.searchParams.get('fundId')
    if (fundId) {
      const fund = db.funds.find((candidate) => candidate.id === fundId && candidate.clubId === clubId)
      if (!fund) return problem(404, 'Không tìm thấy quỹ.', 'FUND_NOT_FOUND')
      if (!canListAdvances(user.value.id, fund)) return problem(403, 'Bạn không xem được tạm ứng của quỹ này.', 'FORBIDDEN')
    }
    const statuses = url.searchParams.getAll('status')
    const mine = url.searchParams.get('mine') === 'true'
    const overdue = url.searchParams.get('overdue') === 'true'
    const keyword = url.searchParams.get('q')
    const rows = db.advances
      .filter((advance) => advance.clubId === clubId && (!fundId || advance.fundId === fundId))
      .filter((advance) => statuses.length === 0 || statuses.includes(advance.status))
      .filter((advance) => (!mine || advance.requesterId === user.value.id) && (!overdue || isAdvanceOverdue(advance)))
      .filter((advance) => matchesKeyword(`${advance.purpose} ${personRef(advance.requesterId).fullName}`, keyword))
      .filter((advance) => canViewAdvance(user.value.id, advance))
      .toSorted(newestFirst)
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map(toAdvanceSummary) })
  }),

  http.get(`${API}/clubs/:clubId/advances/:advanceId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const advance = findAdvance(clubId, params.advanceId)
    if (!advance) return problem(404, 'Không tìm thấy tạm ứng.', 'ADVANCE_NOT_FOUND')
    if (!canViewAdvance(user.value.id, advance)) return problem(403, 'Tạm ứng chỉ người ứng, ban chủ nhiệm và Trưởng BTC của quỹ sự kiện đó xem được.', 'FORBIDDEN')
    return HttpResponse.json(toAdvanceDetail(advance, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/advances`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const body = (await request.json()) as Partial<ProposeAdvanceRequest>
    const fund = db.funds.find((candidate) => candidate.id === body.fundId && candidate.clubId === clubId)
    if (!fund) return problem(400, 'Chọn quỹ tạm ứng.', 'VALIDATION', [{ field: 'fundId', message: 'Quỹ không hợp lệ.' }])
    if (!canProposeIn(user.value.id, fund)) return forbidden(clubId, 'PROPOSE_EXPENSE', `đề xuất tạm ứng từ ${fundName(fund)}`)
    if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không nhận tạm ứng mới.', 'FUND_SETTLED')
    // BR-FIN-05: đang có tạm ứng quá hạn ở CLB thì chưa được ứng thêm.
    const overdue = overdueAdvanceOf(user.value.id, clubId)
    if (overdue) {
      return problem(
        422,
        `Bạn còn tạm ứng quá hạn quyết toán (${overdue.purpose}, ${formatMoney(overdue.amount)}, hạn ${formatDate(overdue.settleBy)}). Quyết toán khoản đó trước khi ứng thêm.`,
        'ADVANCE_OVERDUE',
      )
    }
    const errors = proposalErrors(body)
    if (errors.length > 0) return problem(400, 'Thông tin tạm ứng chưa hợp lệ.', 'VALIDATION', errors)
    const advance: DbAdvance = {
      id: newId('adv'),
      clubId,
      fundId: fund.id,
      requesterId: user.value.id,
      amount: body.amount as number,
      purpose: (body.purpose ?? '').trim(),
      category: body.category as DbAdvance['category'],
      settleBy: body.settleBy as string,
      status: 'PROPOSED',
      approverId: null,
      decidedAt: null,
      rejectionReason: null,
      disbursedBy: null,
      disbursedOn: null,
      disbursementTxId: null,
      remindedFor: null,
      overdueNotifiedFor: null,
      createdAt: nowIso(),
      version: 1,
    }
    db.advances.push(advance)
    notify(approversOf(fund), {
      clubId,
      category: 'FINANCE',
      title: `Tạm ứng chờ duyệt: ${advance.purpose}`,
      body: `${personRef(advance.requesterId).fullName} đề xuất ${formatMoney(advance.amount)} từ ${fundName(fund)}.`,
      target: advanceTarget(advance),
      actorId: user.value.id,
    })
    return HttpResponse.json(toAdvanceDetail(advance, user.value.id), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/advances/:advanceId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const advance = findAdvance(clubId, params.advanceId)
    const fund = advance ? fundOfAdvance(advance) : undefined
    if (!advance || !fund) return problem(404, 'Không tìm thấy tạm ứng.', 'ADVANCE_NOT_FOUND')
    if (!canViewAdvance(user.value.id, advance)) return problem(403, 'Bạn không xem được tạm ứng này.', 'FORBIDDEN')
    const body = (await request.json()) as Partial<AdvanceTransitionRequest>
    const userId = user.value.id
    const invalid = () => problem(422, `Không thể thực hiện khi tạm ứng đang ở trạng thái ${statusLabel[advance.status]}.`, 'INVALID_TRANSITION')
    const conflict = () => problem(409, 'Tạm ứng vừa được người khác cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    const target = advanceTarget(advance)

    switch (body.action) {
      case 'APPROVE':
      case 'REJECT': {
        const verb = body.action === 'APPROVE' ? 'duyệt' : 'từ chối'
        if (!canApproveIn(userId, fund)) return forbidden(clubId, 'APPROVE_EXPENSE', `${verb} tạm ứng ở ${fundName(fund)}`)
        if (advance.requesterId === userId) return problem(403, 'Bạn không tự duyệt tạm ứng của mình được.', 'SELF_APPROVAL')
        if (body.version !== advance.version) return conflict()
        if (advance.status !== 'PROPOSED') return invalid()
        const reason = (body.reason ?? '').trim()
        if (body.action === 'REJECT' && (reason.length < REASON_MIN || reason.length > REASON_MAX)) {
          return problem(400, 'Vui lòng nhập lý do từ chối.', 'VALIDATION', [{ field: 'reason', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
        }
        Object.assign(advance, {
          status: body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          approverId: userId,
          decidedAt: nowIso(),
          rejectionReason: body.action === 'REJECT' ? reason : null,
        })
        if (body.action === 'APPROVE') {
          notify([advance.requesterId], { clubId, category: 'FINANCE', title: `Tạm ứng đã được duyệt: ${advance.purpose}`, body: 'Chờ Thủ quỹ ghi đã ứng.', target, actorId: userId })
          notify(ledgerKeepersOf(clubId), { clubId, category: 'FINANCE', title: `Tạm ứng chờ ghi đã ứng: ${advance.purpose}`, body: `${formatMoney(advance.amount)} từ ${fundName(fund)}.`, target, actorId: userId })
        } else {
          notify([advance.requesterId], { clubId, category: 'FINANCE', title: `Tạm ứng bị từ chối: ${advance.purpose}`, body: `Lý do: ${reason}`, target, actorId: userId })
        }
        break
      }
      case 'DISBURSE': {
        if (!keepsLedger(userId, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'ghi đã ứng')
        if (body.version !== advance.version) return conflict()
        if (advance.status !== 'APPROVED') return invalid()
        if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không ghi thêm giao dịch.', 'FUND_SETTLED')
        const balance = fundBalance(fund.id)
        // BR-FIN-08: không chi quá số dư.
        if (advance.amount > balance) {
          return problem(422, `Số dư ${fundName(fund)} còn ${formatMoney(balance)}, không đủ ứng ${formatMoney(advance.amount)}.`, 'INSUFFICIENT_BALANCE')
        }
        const disbursedOn = body.disbursedOn ?? vnToday()
        if (!isRealDate(disbursedOn) || disbursedOn > vnToday()) {
          return problem(400, 'Ngày ứng không hợp lệ.', 'VALIDATION', [{ field: 'disbursedOn', message: 'Ngày ứng không được sau hôm nay.' }])
        }
        disburse(advance, userId, disbursedOn)
        notify([advance.requesterId], {
          clubId,
          category: 'FINANCE',
          title: `Đã nhận tạm ứng: ${advance.purpose}`,
          body: `${formatMoney(advance.amount)}. Quyết toán trước ${formatDate(advance.settleBy)}.`,
          target,
          actorId: userId,
        })
        break
      }
      default:
        return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    }
    advance.version += 1
    return HttpResponse.json(toAdvanceDetail(advance, userId))
  }),
]

import { http, HttpResponse } from 'msw'
import type {
  AdvanceTransitionRequest,
  CloseAdvanceRequest,
  ProposeAdvanceRequest,
  SettlementLineDecisionRequest,
  SubmitSettlementLineRequest,
} from '@/features/finance/model/advanceTypes'
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
  confirmedAmountOf,
  fundOfAdvance,
  HELD_STATUSES,
  isAdvanceOverdue,
  overdueAdvanceOf,
  toAdvanceDetail,
  toAdvanceSummary,
} from '../mockAdvances'
import { approversOf, canApproveIn, canProposeIn, canReachClubFinance, fundBalance, fundName, keepsLedger, ledgerKeepersOf, recordTransaction } from '../mockFinance'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { personRef } from '../mockMembers'
import { financeTarget, notify } from '../mockNotifications'
import { isRealDate, nowIso, shiftDate, vnToday } from '../mockTime'
import type { DbAdvance, DbAdvanceLine } from '../seed/advanceSeed'

// FR-FIN-07: đề xuất, duyệt hoặc từ chối, ghi Đã ứng. Quyền theo bảng ở kế hoạch đợt 7: đề xuất qua `canProposeIn`, duyệt qua
// `canApproveIn`, ghi Đã ứng cần `RECORD_LEDGER`; người đề xuất không tự duyệt.
// FR-FIN-08: người ứng nộp chứng từ nhiều lần; người giữ sổ xác nhận hoặc trả lại từng lần, rồi chốt: hoàn phần thừa, chi bổ
// sung phần thiếu (đi qua duyệt như khoản chi thường), hoặc khớp.

const MAX_AMOUNT = 1_000_000_000
const PURPOSE_MIN = 5
const PURPOSE_MAX = 500
const LINE_TEXT_MIN = 3
const LINE_TEXT_MAX = 200
const MAX_LINE_ATTACHMENTS = 5

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

const conflictProblem = () => problem(409, 'Tạm ứng vừa được người khác cập nhật. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')

/** Kiểm một lần nộp chứng từ (400 theo ô); chứng từ do chính người ứng tải lên cho CLB này, chưa dùng ở giao dịch hay lần nộp khác. */
function lineErrors(body: Partial<SubmitSettlementLineRequest>, userId: string, clubId: string) {
  const amount = body.amount
  const description = (body.description ?? '').trim()
  const ids = Array.isArray(body.attachmentIds) ? body.attachmentIds : []
  const usedElsewhere = (id: string) =>
    db.transactions.some((transaction) => transaction.attachmentIds.includes(id)) || db.advances.some((advance) => advance.lines.some((line) => line.attachmentIds.includes(id)))
  const attachmentsOk =
    ids.length > 0 &&
    ids.length <= MAX_LINE_ATTACHMENTS &&
    new Set(ids).size === ids.length &&
    ids.every((id) => db.attachments.some((file) => file.id === id && file.uploadedBy === userId && file.voucherClubId === clubId) && !usedElsewhere(id))
  return [
    ...(typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT
      ? [{ field: 'amount', message: 'Số tiền là số nguyên dương, tối đa 1.000.000.000 đ (BR-FIN-04).' }]
      : []),
    ...(description.length < LINE_TEXT_MIN || description.length > LINE_TEXT_MAX
      ? [{ field: 'description', message: `Nội dung cần từ ${LINE_TEXT_MIN} đến ${LINE_TEXT_MAX} ký tự.` }]
      : []),
    ...(!isRealDate(body.spentOn) || body.spentOn > vnToday() ? [{ field: 'spentOn', message: 'Ngày chi không hợp lệ hoặc sau hôm nay.' }] : []),
    ...(!attachmentsOk ? [{ field: 'attachmentIds', message: `Cần ít nhất một chứng từ (tối đa ${MAX_LINE_ATTACHMENTS} tệp, mỗi tệp dùng một lần).` }] : []),
  ]
}

/** Giao dịch sinh ra khi chốt quyết toán (FR-FIN-08), gắn `advanceId`. */
function closureTransaction(
  advance: DbAdvance,
  fields: Pick<DbTransaction, 'type' | 'direction' | 'amount' | 'description' | 'proposerId' | 'status'> & Partial<DbTransaction>,
  actorId: string,
): DbTransaction {
  return recordTransaction({ clubId: advance.clubId, fundId: advance.fundId, category: advance.category, attachmentIds: [], advanceId: advance.id, ...fields }, actorId)
}

/** Ghi Đã ứng: sinh khoản chi Đã ghi sổ gắn `advanceId`, người duyệt là người duyệt tạm ứng (dùng cho R-01 ở báo cáo). */
function disburse(advance: DbAdvance, userId: string, disbursedOn: string): void {
  const now = nowIso()
  const transaction = recordTransaction(
    {
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
      createdAt: now,
      decidedAt: advance.decidedAt,
      postedAt: now,
      advanceId: advance.id,
    },
    userId,
  )
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
      lines: [],
      closure: null,
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
    const conflict = conflictProblem
    const target = advanceTarget(advance)

    switch (body.action) {
      case 'APPROVE':
      case 'REJECT': {
        const verb = body.action === 'APPROVE' ? 'duyệt' : 'từ chối'
        if (!canApproveIn(userId, fund)) return forbidden(clubId, 'APPROVE_EXPENSE', `${verb} tạm ứng ở ${fundName(fund)}`)
        if (advance.requesterId === userId) return problem(403, 'Bạn không tự duyệt tạm ứng của mình được.', 'SELF_APPROVAL')
        if (body.version !== advance.version) return conflict()
        if (advance.status !== 'PROPOSED') return invalid()
        if (body.action === 'APPROVE' && fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không duyệt thêm tạm ứng.', 'FUND_SETTLED')
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

  http.post(`${API}/clubs/:clubId/advances/:advanceId/settlement-lines`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const advance = findAdvance(clubId, params.advanceId)
    const fund = advance ? fundOfAdvance(advance) : undefined
    if (!advance || !fund) return problem(404, 'Không tìm thấy tạm ứng.', 'ADVANCE_NOT_FOUND')
    const userId = user.value.id
    if (!canViewAdvance(userId, advance)) return problem(403, 'Bạn không xem được tạm ứng này.', 'FORBIDDEN')
    if (advance.requesterId !== userId) return problem(403, 'Chỉ người ứng nộp chứng từ quyết toán.', 'FORBIDDEN')
    const body = (await request.json()) as Partial<SubmitSettlementLineRequest>
    if (body.version !== advance.version) return conflictProblem()
    if (!HELD_STATUSES.includes(advance.status)) {
      return problem(422, `Chỉ nộp chứng từ khi tạm ứng Đã ứng hoặc Quyết toán một phần; hiện đang ${statusLabel[advance.status]}.`, 'INVALID_TRANSITION')
    }
    const errors = lineErrors(body, userId, clubId)
    if (errors.length > 0) return problem(400, 'Thông tin chứng từ chưa hợp lệ.', 'VALIDATION', errors)
    const line: DbAdvanceLine = {
      id: newId('advl'),
      amount: body.amount as number,
      description: (body.description ?? '').trim(),
      spentOn: body.spentOn as string,
      attachmentIds: body.attachmentIds ?? [],
      status: 'SUBMITTED',
      submittedAt: nowIso(),
      decidedBy: null,
      decidedAt: null,
      note: null,
    }
    advance.lines.push(line)
    advance.version += 1
    notify(ledgerKeepersOf(clubId), {
      clubId,
      category: 'FINANCE',
      title: `Chứng từ quyết toán chờ xác nhận: ${advance.purpose}`,
      body: `${personRef(userId).fullName} nộp ${formatMoney(line.amount)} (${line.description}).`,
      target: advanceTarget(advance),
      actorId: userId,
    })
    return HttpResponse.json(toAdvanceDetail(advance, userId), { status: 201 })
  }),

  http.post(`${API}/clubs/:clubId/advances/:advanceId/settlement-lines/:lineId/decision`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const advance = findAdvance(clubId, params.advanceId)
    if (!advance) return problem(404, 'Không tìm thấy tạm ứng.', 'ADVANCE_NOT_FOUND')
    const userId = user.value.id
    if (!keepsLedger(userId, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'xác nhận chứng từ quyết toán')
    const line = advance.lines.find((candidate) => candidate.id === params.lineId)
    if (!line) return problem(404, 'Không tìm thấy lần nộp chứng từ.', 'LINE_NOT_FOUND')
    const body = (await request.json()) as Partial<SettlementLineDecisionRequest>
    if (body.version !== advance.version) return conflictProblem()
    if (!HELD_STATUSES.includes(advance.status) || line.status !== 'SUBMITTED') return problem(422, 'Lần nộp này đã được xử lý.', 'INVALID_TRANSITION')
    if (body.action !== 'CONFIRM' && body.action !== 'RETURN') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    const note = (body.note ?? '').trim()
    if (body.action === 'RETURN' && (note.length < REASON_MIN || note.length > REASON_MAX)) {
      return problem(400, 'Vui lòng ghi lý do trả lại.', 'VALIDATION', [{ field: 'note', message: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }])
    }
    const confirm = body.action === 'CONFIRM'
    Object.assign(line, { status: confirm ? 'CONFIRMED' : 'RETURNED', decidedBy: userId, decidedAt: nowIso(), note: confirm ? null : note })
    if (confirm && advance.status === 'DISBURSED') advance.status = 'PARTIALLY_SETTLED'
    advance.version += 1
    notify([advance.requesterId], {
      clubId,
      category: 'FINANCE',
      title: confirm ? `Chứng từ quyết toán đã được xác nhận: ${advance.purpose}` : `Chứng từ quyết toán bị trả lại: ${advance.purpose}`,
      body: confirm
        ? `${formatMoney(line.amount)} (${line.description}).`
        : `${formatMoney(line.amount)} (${line.description}). Lý do: ${note}. Nộp lại bằng lần nộp mới.`,
      target: advanceTarget(advance),
      actorId: userId,
    })
    return HttpResponse.json(toAdvanceDetail(advance, userId))
  }),

  http.post(`${API}/clubs/:clubId/advances/:advanceId/closure`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const advance = findAdvance(clubId, params.advanceId)
    const fund = advance ? fundOfAdvance(advance) : undefined
    if (!advance || !fund) return problem(404, 'Không tìm thấy tạm ứng.', 'ADVANCE_NOT_FOUND')
    const userId = user.value.id
    if (!keepsLedger(userId, clubId)) return forbidden(clubId, 'RECORD_LEDGER', 'chốt quyết toán tạm ứng')
    const body = (await request.json()) as Partial<CloseAdvanceRequest>
    if (body.version !== advance.version) return conflictProblem()
    if (!HELD_STATUSES.includes(advance.status)) return problem(422, `Không thể chốt khi tạm ứng đang ở trạng thái ${statusLabel[advance.status]}.`, 'INVALID_TRANSITION')
    const pending = advance.lines.filter((line) => line.status === 'SUBMITTED').length
    if (pending > 0) return problem(422, `Còn ${pending} lần nộp chứng từ chờ xác nhận; xác nhận hoặc trả lại trước khi chốt.`, 'ADVANCE_HAS_PENDING_LINES')
    if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không ghi thêm giao dịch.', 'FUND_SETTLED')
    const difference = advance.amount - confirmedAmountOf(advance)
    const refundOn = body.refundOn ?? vnToday()
    if (difference > 0 && (!isRealDate(refundOn) || refundOn > vnToday() || (advance.disbursedOn !== null && refundOn < advance.disbursedOn))) {
      return problem(400, 'Ngày nhận lại tiền không hợp lệ.', 'VALIDATION', [{ field: 'refundOn', message: 'Ngày nhận lại từ ngày ứng đến hôm nay.' }])
    }
    const now = nowIso()
    const requesterName = personRef(advance.requesterId).fullName
    let transaction: DbTransaction | null = null
    if (difference > 0) {
      // Thừa: người ứng trả lại, ghi điều chỉnh tăng quỹ đã ghi sổ tham chiếu khoản chi ứng.
      transaction = closureTransaction(
        advance,
        {
          type: 'ADJUSTMENT',
          direction: 'IN',
          amount: difference,
          description: `Hoàn tạm ứng: ${advance.purpose} (${requesterName})`,
          proposerId: userId,
          status: 'POSTED',
          posterId: userId,
          postedAt: now,
          occurredOn: refundOn,
          originalId: advance.disbursementTxId,
        },
        userId,
      )
    } else if (difference < 0) {
      // Thiếu: khoản chi Đề xuất đứng tên người ứng, duyệt và ghi sổ như khoản chi thường; người ứng không tự duyệt được.
      transaction = closureTransaction(
        advance,
        {
          type: 'EXPENSE',
          direction: 'OUT',
          amount: -difference,
          description: `Chi bổ sung tạm ứng: ${advance.purpose} (${requesterName})`,
          proposerId: advance.requesterId,
          status: 'PROPOSED',
          attachmentIds: advance.lines.filter((line) => line.status === 'CONFIRMED').flatMap((line) => line.attachmentIds),
        },
        userId,
      )
      // Người ứng không tự duyệt được khoản này nên không báo cho họ.
      notify(approversOf(fund).filter((approverId) => approverId !== advance.requesterId), {
        clubId,
        category: 'FINANCE',
        title: `Khoản chi cần duyệt: ${transaction.description}`,
        body: `${formatMoney(transaction.amount)} từ ${fundName(fund)}, phần chi vượt tạm ứng.`,
        target: financeTarget(clubId, transaction.id),
        actorId: userId,
      })
    }
    advance.status = 'SETTLED'
    advance.closure = {
      kind: difference > 0 ? 'REFUND' : difference < 0 ? 'TOP_UP' : 'EXACT',
      amount: Math.abs(difference),
      transactionId: transaction?.id ?? null,
      closedBy: userId,
      closedAt: now,
    }
    advance.version += 1
    const outcome =
      difference > 0
        ? `Đã nhận lại ${formatMoney(difference)} tiền thừa.`
        : difference < 0
          ? `Phần chi vượt ${formatMoney(-difference)} chờ ban chủ nhiệm duyệt.`
          : 'Số chi khớp số đã ứng.'
    notify([advance.requesterId], { clubId, category: 'FINANCE', title: `Tạm ứng đã quyết toán: ${advance.purpose}`, body: outcome, target: advanceTarget(advance), actorId: userId })
    return HttpResponse.json(toAdvanceDetail(advance, userId))
  }),
]

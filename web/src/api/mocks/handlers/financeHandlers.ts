import { http, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type { FileRef } from '@/api/commonTypes'
import type { EventStatus } from '@/features/event/model/eventTypes'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type CreateTransactionRequest,
  type FundAction,
  type FundDetail,
  type FundSummary,
  type TransactionAction,
  type TransactionDetail,
  type TransactionRef,
  type TransactionStatus,
  type TransactionSummary,
  type TransactionTransitionRequest,
  type FundTransitionRequest,
} from '@/features/finance/model/financeTypes'
import { formatMoney } from '@/shared/format/formatMoney'
import { validateUploadFile } from '@/shared/lib/validateUploadFile'
import { db, type DbFund, type DbTransaction } from '../db'
import { forbidden } from '../mockAccess'
import {
  approversOf,
  canApproveIn,
  canProposeIn,
  canReachClubFinance,
  canUploadVoucher,
  canViewFund,
  canViewRequests,
  canViewTransaction,
  eventOfFund,
  flowFor,
  fundBalance,
  fundName,
  isDepartmentLead,
  keepsLedger,
  ledgerKeepersOf,
  pendingCountOf,
} from '../mockFinance'
import { API, currentUser, matchesKeyword, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { personRef } from '../mockMembers'
import { financeTarget, notify } from '../mockNotifications'
import { isRealDate, nowIso, vnToday } from '../mockTime'
import { DEFAULT_RECEIPT_THRESHOLD, generalFundId } from '../seed/financeSeed'

const transactionStatusLabel: Record<TransactionStatus, string> = {
  PROPOSED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  POSTED: 'Đã ghi sổ',
  REJECTED: 'Bị từ chối',
  WITHDRAWN: 'Đã rút',
}

const MAX_AMOUNT = 1_000_000_000
const MAX_ATTACHMENTS = 5
/** Lý do không xem được quỹ, theo loại quỹ (IF-01). */
const fundForbidden = (fund: DbFund) =>
  problem(403, fund.kind === 'GENERAL' ? 'Chỉ thành viên CLB xem được Quỹ chung.' : 'Chỉ ban chủ nhiệm và ban tổ chức sự kiện xem được quỹ sự kiện.', 'FORBIDDEN')

/** Lý do không xem được một giao dịch: theo quỹ nếu đã ghi sổ, theo người được xem khoản chưa ghi sổ nếu chưa (IF-01). */
function transactionForbidden(transaction: DbTransaction): Response {
  const fund = fundById(transaction.fundId)
  if (transaction.status === 'POSTED' && fund) return fundForbidden(fund)
  return problem(403, 'Khoản chưa ghi sổ chỉ ban chủ nhiệm, người đề xuất và Trưởng BTC của sự kiện xem được.', 'FORBIDDEN')
}

const fundById = (fundId: unknown) => db.funds.find((fund) => fund.id === fundId)
const nameOfFund = (fundId: string) => {
  const fund = fundById(fundId)
  return fund ? fundName(fund) : ''
}

function fundActions(userId: string, fund: DbFund): FundAction[] {
  const actions: FundAction[] = []
  const open = fund.status === 'OPEN'
  const proposer = canProposeIn(userId, fund)
  if (open && keepsLedger(userId, fund.clubId)) actions.push('RECORD_INCOME')
  if (open && proposer) actions.push('PROPOSE_EXPENSE')
  // Người đề xuất được thấy tab khoản chi để theo dõi khoản của mình.
  if (proposer || canViewRequests(userId, fund)) actions.push('VIEW_REQUESTS')
  if (settleBlocker(fund) === null && keepsLedger(userId, fund.clubId)) actions.push('SETTLE')
  return actions
}

const SETTLEABLE_EVENT: EventStatus[] = ['ENDED', 'CANCELLED']

/** FR-FIN-11: lý do chưa quyết toán được quỹ (chưa xét người gọi); null khi đủ điều kiện. */
function settleBlocker(fund: DbFund): Response | null {
  const event = eventOfFund(fund)
  if (fund.kind !== 'EVENT' || !event) return problem(422, 'Chỉ quyết toán quỹ sự kiện; Quỹ chung không quyết toán.', 'INVALID_TRANSITION')
  if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán.', 'FUND_SETTLED')
  if (!SETTLEABLE_EVENT.includes(event.status)) return problem(422, 'Chỉ quyết toán khi sự kiện đã kết thúc hoặc đã hủy.', 'INVALID_TRANSITION')
  const pending = pendingCountOf(fund.id)
  if (pending > 0) {
    return problem(422, `Quỹ còn ${pending} khoản chờ duyệt hoặc chờ ghi sổ; cần xử lý xong trước khi quyết toán.`, 'FUND_HAS_PENDING')
  }
  return null
}

/** Chuyển số dư còn lại về Quỹ chung, quỹ sang Đã quyết toán; sự kiện Đã kết thúc tự sang Đã quyết toán (SRS 4.2). */
function settleFund(fund: DbFund, userId: string): void {
  const balance = fundBalance(fund.id)
  const now = nowIso()
  const event = eventOfFund(fund)
  if (balance > 0) {
    newTransaction({
      clubId: fund.clubId,
      fundId: fund.id,
      type: 'TRANSFER',
      direction: 'OUT',
      amount: balance,
      category: 'FUND_TRANSFER',
      description: `Quyết toán ${fundName(fund)}: chuyển số dư về Quỹ chung`,
      proposerId: userId,
      attachmentIds: [],
      targetFundId: generalFundId(fund.clubId),
      status: 'POSTED',
      posterId: userId,
      postedAt: now,
      occurredOn: vnToday(),
    })
  }
  Object.assign(fund, { status: 'SETTLED', settledAt: now, settledBy: userId, version: fund.version + 1 })
  if (event?.status === 'ENDED') Object.assign(event, { status: 'SETTLED', version: event.version + 1 })
}

const receiptThresholdOf = (clubId: string) => db.clubs.find((club) => club.id === clubId)?.expenseReceiptThreshold ?? DEFAULT_RECEIPT_THRESHOLD

function toFundSummary(fund: DbFund): FundSummary {
  const event = eventOfFund(fund)
  return {
    id: fund.id,
    kind: fund.kind,
    name: fundName(fund),
    event: event ? { id: event.id, name: event.name, status: event.status } : null,
    status: fund.status,
    balance: fundBalance(fund.id),
  }
}

function toFundDetail(fund: DbFund, userId: string): FundDetail {
  return {
    ...toFundSummary(fund),
    receiptThreshold: receiptThresholdOf(fund.clubId),
    pendingCount: canViewRequests(userId, fund) ? pendingCountOf(fund.id) : null,
    settledAt: fund.settledAt,
    settledBy: fund.settledBy ? personRef(fund.settledBy) : null,
    allowedActions: fundActions(userId, fund),
    version: fund.version,
  }
}

function toSummary(transaction: DbTransaction, perspectiveFundId?: string): TransactionSummary {
  return {
    id: transaction.id,
    fundId: transaction.fundId,
    fundName: nameOfFund(transaction.fundId),
    type: transaction.type,
    flow: flowFor(transaction, perspectiveFundId),
    amount: transaction.amount,
    category: transaction.category,
    description: transaction.description,
    occurredOn: transaction.occurredOn,
    status: transaction.status,
    proposer: personRef(transaction.proposerId),
    originalId: transaction.originalId,
    createdAt: transaction.createdAt,
  }
}

function toRef(transaction: DbTransaction): TransactionRef {
  return {
    id: transaction.id,
    type: transaction.type,
    flow: transaction.direction,
    amount: transaction.amount,
    description: transaction.description,
    status: transaction.status,
  }
}

function fileRefs(ids: string[]): FileRef[] {
  return ids.flatMap((id) => {
    const file = db.attachments.find((attachment) => attachment.id === id)
    return file ? [{ id: file.id, name: file.name, size: file.size, contentType: file.contentType }] : []
  })
}

/** Giao dịch điều chỉnh được: đã ghi sổ, thuộc quỹ đang mở, không phải chuyển quỹ (BR-FIN-01). */
function adjustable(transaction: DbTransaction): boolean {
  return transaction.status === 'POSTED' && transaction.type !== 'TRANSFER' && fundById(transaction.fundId)?.status === 'OPEN'
}

/** ST-EXP: rút khi còn Đề xuất (người tạo); duyệt, từ chối (ban chủ nhiệm khác người tạo, BR-ACL-01); ghi sổ khoản chi đã duyệt, điều chỉnh khoản đã ghi sổ (Thủ quỹ). */
function transactionActions(userId: string, transaction: DbTransaction): TransactionAction[] {
  const actions: TransactionAction[] = []
  if (transaction.status === 'PROPOSED') {
    if (transaction.proposerId === userId) actions.push('WITHDRAW')
    else if (canApproveTransaction(userId, transaction)) actions.push('APPROVE', 'REJECT')
  }
  const treasurer = keepsLedger(userId, transaction.clubId)
  if (transaction.status === 'APPROVED' && transaction.type === 'EXPENSE' && treasurer) actions.push('POST')
  if (treasurer && adjustable(transaction)) actions.push('ADJUST')
  return actions
}

function canApproveTransaction(userId: string, transaction: DbTransaction): boolean {
  const fund = fundById(transaction.fundId)
  return fund !== undefined && canApproveIn(userId, fund)
}

/** Tên loại khoản trong thông báo và câu báo lỗi. */
const kindOf = (transaction: DbTransaction) => (transaction.type === 'ADJUSTMENT' ? 'Điều chỉnh giảm quỹ' : 'Khoản chi')

/** `perspectiveFundId`: quỹ người xem đang mở, để chuyển quỹ hiện là tiền vào ở quỹ nhận như trong sổ quỹ. */
function toDetail(transaction: DbTransaction, userId: string, perspectiveFundId?: string): TransactionDetail {
  const original = transaction.originalId ? db.transactions.find((candidate) => candidate.id === transaction.originalId) : undefined
  return {
    ...toSummary(transaction, perspectiveFundId),
    approver: transaction.approverId ? personRef(transaction.approverId) : null,
    poster: transaction.posterId ? personRef(transaction.posterId) : null,
    attachments: fileRefs(transaction.attachmentIds),
    original: original && canViewTransaction(userId, original) ? toRef(original) : null,
    adjustments: db.transactions.filter((candidate) => candidate.originalId === transaction.id && canViewTransaction(userId, candidate)).map(toRef),
    counterpartFundName: transaction.targetFundId ? nameOfFund(transaction.targetFundId) : null,
    rejectionReason: transaction.rejectionReason,
    decidedAt: transaction.decidedAt,
    postedAt: transaction.postedAt,
    allowedActions: transactionActions(userId, transaction),
    version: transaction.version,
  }
}

/** CLB phải tồn tại và người gọi là thành viên, hoặc BTC của một sự kiện còn hoạt động (BR-SEC-01). */
function clubGate(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canReachClubFinance(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  return null
}

function findFund(clubId: string, fundId: unknown): DbFund | undefined {
  const fund = fundById(fundId)
  return fund?.clubId === clubId ? fund : undefined
}

/** Sổ quỹ: theo ngày tiền vào, ra giảm dần; trùng ngày thì xét thời điểm ghi sổ, rồi mã (mốc thời gian mock chỉ tới giây). */
function byLedgerOrder(a: DbTransaction, b: DbTransaction): number {
  const day = (b.occurredOn ?? b.createdAt.slice(0, 10)).localeCompare(a.occurredOn ?? a.createdAt.slice(0, 10))
  if (day !== 0) return day
  const at = (b.postedAt ?? b.createdAt).localeCompare(a.postedAt ?? a.createdAt)
  return at !== 0 ? at : b.id.localeCompare(a.id)
}

/** Lỗi chung của mọi giao dịch: số tiền (BR-FIN-04), nội dung, chứng từ do chính người gọi tải lên cho CLB này và chưa dùng ở giao dịch khác. */
function commonErrors(body: Partial<CreateTransactionRequest>, userId: string, clubId: string): FieldError[] {
  const errors: FieldError[] = []
  const amount = body.amount
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    errors.push({ field: 'amount', message: 'Số tiền là số nguyên dương, tối đa 1.000.000.000 đ.' })
  }
  const description = (body.description ?? '').trim()
  if (description.length < 3 || description.length > 200) errors.push({ field: 'description', message: 'Nội dung cần từ 3 đến 200 ký tự.' })
  const attachmentIds = body.attachmentIds ?? []
  const attachmentsOk =
    Array.isArray(attachmentIds) &&
    attachmentIds.length <= MAX_ATTACHMENTS &&
    attachmentIds.every(
      (id) =>
        db.attachments.some((attachment) => attachment.id === id && attachment.uploadedBy === userId && attachment.voucherClubId === clubId) &&
        !db.transactions.some((transaction) => transaction.attachmentIds.includes(id)),
    )
  if (!attachmentsOk) errors.push({ field: 'attachmentIds', message: `Chứng từ không hợp lệ (tối đa ${MAX_ATTACHMENTS} tệp, mỗi tệp dùng cho một giao dịch).` })
  return errors
}

function newTransaction(fields: Pick<DbTransaction, 'clubId' | 'fundId' | 'type' | 'direction' | 'amount' | 'category' | 'description' | 'proposerId' | 'attachmentIds'> & Partial<DbTransaction>): DbTransaction {
  const transaction: DbTransaction = {
    id: newId('tx'),
    occurredOn: null,
    status: 'PROPOSED',
    approverId: null,
    posterId: null,
    originalId: null,
    targetFundId: null,
    rejectionReason: null,
    createdAt: nowIso(),
    decidedAt: null,
    postedAt: null,
    version: 1,
    ...fields,
  }
  db.transactions.push(transaction)
  return transaction
}

/** FR-FIN-01: Thủ quỹ ghi khoản thu, ghi thẳng vào Đã ghi sổ. */
function recordIncome(body: Partial<CreateTransactionRequest>, fund: DbFund, userId: string): Response {
  if (!keepsLedger(userId, fund.clubId)) return forbidden(fund.clubId, 'RECORD_LEDGER', 'ghi khoản thu')
  if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không ghi thêm giao dịch.', 'FUND_SETTLED')
  const errors = commonErrors(body, userId, fund.clubId)
  const category = INCOME_CATEGORIES.find((candidate) => candidate === body.category)
  if (!category) errors.push({ field: 'category', message: 'Chọn hạng mục thu.' })
  if (!isRealDate(body.occurredOn) || body.occurredOn > vnToday()) errors.push({ field: 'occurredOn', message: 'Ngày thu không hợp lệ hoặc sau hôm nay.' })
  if (errors.length > 0 || !category) return problem(400, 'Thông tin khoản thu chưa hợp lệ.', 'VALIDATION', errors)
  const now = nowIso()
  const transaction = newTransaction({
    clubId: fund.clubId,
    fundId: fund.id,
    type: 'INCOME',
    direction: 'IN',
    amount: body.amount as number,
    category,
    description: (body.description ?? '').trim(),
    proposerId: userId,
    attachmentIds: body.attachmentIds ?? [],
    occurredOn: body.occurredOn as string,
    status: 'POSTED',
    posterId: userId,
    postedAt: now,
  })
  return HttpResponse.json(toDetail(transaction, userId), { status: 201 })
}

/** FR-FIN-02: đề xuất chi vào trạng thái Đề xuất; trên ngưỡng phải có chứng từ (BR-FIN-03); báo ban chủ nhiệm để duyệt (FR-NOT-02). */
function proposeExpense(body: Partial<CreateTransactionRequest>, fund: DbFund, userId: string): Response {
  if (!canProposeIn(userId, fund)) {
    const reason =
      fund.kind === 'EVENT' && isDepartmentLead(userId, fund.clubId)
        ? 'Trưởng ban, Phó ban chỉ đề xuất chi từ Quỹ chung; quỹ sự kiện do Trưởng BTC hoặc ban chủ nhiệm đề xuất.'
        : 'Chỉ ban chủ nhiệm, Trưởng ban, Phó ban (Quỹ chung) và Trưởng BTC (quỹ sự kiện của mình) được đề xuất chi.'
    return problem(403, reason, 'FORBIDDEN')
  }
  if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không ghi thêm giao dịch.', 'FUND_SETTLED')
  const errors = commonErrors(body, userId, fund.clubId)
  const category = EXPENSE_CATEGORIES.find((candidate) => candidate === body.category)
  if (!category) errors.push({ field: 'category', message: 'Chọn hạng mục chi.' })
  const threshold = receiptThresholdOf(fund.clubId)
  if (typeof body.amount === 'number' && body.amount > threshold && (body.attachmentIds ?? []).length === 0) {
    errors.push({ field: 'attachmentIds', message: `Khoản chi trên ${formatMoney(threshold)} phải có chứng từ.` })
  }
  if (errors.length > 0 || !category) return problem(400, 'Thông tin khoản chi chưa hợp lệ.', 'VALIDATION', errors)
  const transaction = newTransaction({
    clubId: fund.clubId,
    fundId: fund.id,
    type: 'EXPENSE',
    direction: 'OUT',
    amount: body.amount as number,
    category,
    description: (body.description ?? '').trim(),
    proposerId: userId,
    attachmentIds: body.attachmentIds ?? [],
  })
  notifyFinance(approversOf(fund), transaction, `Khoản chi cần duyệt: ${transaction.description}`, userId, `${formatMoney(transaction.amount)} từ ${fundName(fund)}, đề xuất bởi ${personRef(userId).fullName}.`)
  return HttpResponse.json(toDetail(transaction, userId), { status: 201 })
}

/** FR-FIN-05: Thủ quỹ điều chỉnh giao dịch đã ghi sổ kèm lý do (BR-FIN-01); tăng quỹ ghi sổ ngay, giảm quỹ chờ ban chủ nhiệm khác duyệt. */
function createAdjustment(body: Partial<CreateTransactionRequest>, fund: DbFund, userId: string): Response {
  if (!keepsLedger(userId, fund.clubId)) return forbidden(fund.clubId, 'RECORD_LEDGER', 'tạo giao dịch điều chỉnh')
  if (fund.status !== 'OPEN') return problem(422, 'Quỹ đã quyết toán, không ghi thêm giao dịch.', 'FUND_SETTLED')
  const original = db.transactions.find((candidate) => candidate.id === body.originalTransactionId && candidate.fundId === fund.id)
  if (!original || !adjustable(original)) {
    return problem(422, 'Chỉ điều chỉnh được giao dịch đã ghi sổ của quỹ này, không gồm giao dịch chuyển quỹ.', 'INVALID_ORIGINAL')
  }
  const reason = (body.description ?? '').trim()
  const errors = commonErrors(body, userId, fund.clubId).filter((error) => error.field !== 'description')
  if (reason.length < 5 || reason.length > 200) errors.push({ field: 'description', message: 'Lý do điều chỉnh cần từ 5 đến 200 ký tự.' })
  if (body.direction !== 'IN' && body.direction !== 'OUT') errors.push({ field: 'direction', message: 'Chọn tăng hay giảm quỹ.' })
  if (errors.length > 0) return problem(400, 'Thông tin điều chỉnh chưa hợp lệ.', 'VALIDATION', errors)
  const increase = body.direction === 'IN'
  const now = nowIso()
  const transaction = newTransaction({
    clubId: fund.clubId,
    fundId: fund.id,
    type: 'ADJUSTMENT',
    direction: increase ? 'IN' : 'OUT',
    amount: body.amount as number,
    category: original.category,
    description: reason,
    proposerId: userId,
    attachmentIds: body.attachmentIds ?? [],
    originalId: original.id,
    ...(increase ? { status: 'POSTED' as const, posterId: userId, postedAt: now, occurredOn: vnToday() } : {}),
  })
  if (!increase) {
    notifyFinance(
      approversOf(fund),
      transaction,
      `Điều chỉnh giảm quỹ cần duyệt: ${original.description}`,
      userId,
      `Giảm ${formatMoney(transaction.amount)} ở ${fundName(fund)}. Lý do: ${reason}`,
    )
  }
  return HttpResponse.json(toDetail(transaction, userId), { status: 201 })
}

/** FR-NOT-02: khoản chi cần duyệt hoặc đã xử lý; mở thông báo thì máy chủ kiểm tra lại quyền xem giao dịch (BR-SEC-02). */
function notifyFinance(userIds: Iterable<string>, transaction: DbTransaction, title: string, actorId: string, body?: string) {
  notify(userIds, { clubId: transaction.clubId, category: 'FINANCE', title, body, target: financeTarget(transaction.clubId, transaction.id), actorId })
}

/** ST-EXP: Đề xuất → Đã duyệt → Đã ghi sổ; Đề xuất → Bị từ chối, Đã rút. Kiểm quyền trước, rồi phiên bản, rồi trạng thái. */
function transitionTransaction(transaction: DbTransaction, body: Partial<TransactionTransitionRequest>, userId: string): Response {
  const approver = canApproveTransaction(userId, transaction)
  const invalid = () => problem(422, `Không thể thực hiện khi khoản này đang ở trạng thái ${transactionStatusLabel[transaction.status]}.`, 'INVALID_TRANSITION')
  const settled = fundById(transaction.fundId)?.status !== 'OPEN'
  const fundSettled = () => problem(422, 'Quỹ đã quyết toán, không ghi thêm giao dịch.', 'FUND_SETTLED')
  const conflict = () => problem(409, 'Khoản này vừa được người khác xử lý. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
  const now = nowIso()

  switch (body.action) {
    case 'WITHDRAW':
      if (transaction.proposerId !== userId) return problem(403, 'Chỉ người đề xuất được rút khoản này.', 'FORBIDDEN')
      if (body.version !== transaction.version) return conflict()
      if (transaction.status !== 'PROPOSED') return invalid()
      transaction.status = 'WITHDRAWN'
      break
    case 'APPROVE':
    case 'REJECT': {
      if (!approver) return forbidden(transaction.clubId, 'APPROVE_EXPENSE', `duyệt hoặc từ chối ${kindOf(transaction).toLowerCase()}`)
      if (transaction.proposerId === userId) return problem(403, 'Người đề xuất không được tự duyệt hay từ chối khoản của mình, kể cả Chủ nhiệm.', 'SELF_APPROVAL')
      if (body.version !== transaction.version) return conflict()
      if (transaction.status !== 'PROPOSED') return invalid()
      if (body.action === 'REJECT') {
        const reason = (body.reason ?? '').trim()
        if (reason.length < 5 || reason.length > 500) {
          return problem(400, 'Vui lòng nhập lý do từ chối.', 'VALIDATION', [{ field: 'reason', message: 'Lý do cần từ 5 đến 500 ký tự.' }])
        }
        Object.assign(transaction, { status: 'REJECTED', approverId: userId, decidedAt: now, rejectionReason: reason })
        notifyFinance([transaction.proposerId], transaction, `${kindOf(transaction)} bị từ chối: ${transaction.description}`, userId, `Lý do: ${reason}`)
        break
      }
      if (transaction.type === 'ADJUSTMENT') {
        if (settled) return fundSettled()
        // Điều chỉnh không có tiền chi thật nên duyệt là ghi sổ luôn; kiểm số dư ngay lúc này (BR-FIN-08).
        const balance = fundBalance(transaction.fundId)
        if (transaction.amount > balance) {
          return problem(422, `Quỹ chỉ còn ${formatMoney(balance)}, không đủ cho điều chỉnh giảm ${formatMoney(transaction.amount)}.`, 'INSUFFICIENT_FUNDS')
        }
        Object.assign(transaction, { status: 'POSTED', approverId: userId, decidedAt: now, posterId: transaction.proposerId, postedAt: now, occurredOn: vnToday() })
        notifyFinance([transaction.proposerId], transaction, `Điều chỉnh giảm quỹ đã được duyệt và ghi sổ: ${transaction.description}`, userId)
        break
      }
      const threshold = receiptThresholdOf(transaction.clubId)
      if (transaction.amount > threshold && transaction.attachmentIds.length === 0) {
        return problem(422, `Khoản chi trên ${formatMoney(threshold)} phải có chứng từ trước khi duyệt.`, 'RECEIPT_REQUIRED')
      }
      Object.assign(transaction, { status: 'APPROVED', approverId: userId, decidedAt: now })
      notifyFinance([transaction.proposerId], transaction, `Khoản chi đã được duyệt: ${transaction.description}`, userId)
      notifyFinance(
        ledgerKeepersOf(transaction.clubId).filter((id) => id !== transaction.proposerId),
        transaction,
        `Khoản chi chờ ghi sổ: ${transaction.description}`,
        userId,
        `${formatMoney(transaction.amount)}, duyệt bởi ${personRef(userId).fullName}.`,
      )
      break
    }
    case 'POST': {
      if (!keepsLedger(userId, transaction.clubId)) return forbidden(transaction.clubId, 'RECORD_LEDGER', 'ghi sổ khoản chi')
      if (body.version !== transaction.version) return conflict()
      if (transaction.status !== 'APPROVED' || transaction.type !== 'EXPENSE') return invalid()
      if (settled) return fundSettled()
      const balance = fundBalance(transaction.fundId)
      if (transaction.amount > balance) {
        return problem(422, `Quỹ chỉ còn ${formatMoney(balance)}, không đủ ghi sổ khoản chi ${formatMoney(transaction.amount)}.`, 'INSUFFICIENT_FUNDS')
      }
      Object.assign(transaction, { status: 'POSTED', posterId: userId, postedAt: now, occurredOn: vnToday() })
      notifyFinance([transaction.proposerId], transaction, `Khoản chi đã được ghi sổ: ${transaction.description}`, userId)
      break
    }
    default:
      return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
  }
  transaction.version += 1
  return HttpResponse.json(toDetail(transaction, userId))
}

export const financeHandlers = [
  http.get(`${API}/clubs/:clubId/funds`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const status = url.searchParams.get('status')
    const startOf = (fund: DbFund) => eventOfFund(fund)?.startAt ?? ''
    const visible = db.funds
      .filter((fund) => fund.clubId === clubId && canViewFund(user.value.id, fund))
      .filter((fund) => (!kind || fund.kind === kind) && (!status || fund.status === status))
      .toSorted((a, b) => (a.kind === b.kind ? startOf(b).localeCompare(startOf(a)) : a.kind === 'GENERAL' ? -1 : 1))
    const page = paginate(visible, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map(toFundSummary) })
  }),

  http.get(`${API}/clubs/:clubId/funds/:fundId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const fund = findFund(clubId, params.fundId)
    if (!fund) return problem(404, 'Không tìm thấy quỹ.', 'FUND_NOT_FOUND')
    if (!canViewFund(user.value.id, fund)) return fundForbidden(fund)
    return HttpResponse.json(toFundDetail(fund, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/transactions`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const url = new URL(request.url)
    const fundId = url.searchParams.get('fundId') ?? undefined
    if (fundId !== undefined) {
      const fund = findFund(clubId, fundId)
      if (!fund) return problem(404, 'Không tìm thấy quỹ.', 'FUND_NOT_FOUND')
      if (!canViewFund(user.value.id, fund)) return fundForbidden(fund)
    }
    const statuses = url.searchParams.getAll('status')
    const types = url.searchParams.getAll('type')
    const category = url.searchParams.get('category')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const keyword = url.searchParams.get('q')
    const mine = url.searchParams.get('mine') === 'true'
    const rows = db.transactions
      .filter((transaction) => transaction.clubId === clubId)
      .filter((transaction) => fundId === undefined || transaction.fundId === fundId || transaction.targetFundId === fundId)
      .filter((transaction) => (statuses.length === 0 || statuses.includes(transaction.status)) && (types.length === 0 || types.includes(transaction.type)))
      .filter((transaction) => !category || transaction.category === category)
      .filter((transaction) => !isRealDate(from) || (transaction.occurredOn !== null && transaction.occurredOn >= from))
      .filter((transaction) => !isRealDate(to) || (transaction.occurredOn !== null && transaction.occurredOn <= to))
      .filter((transaction) => !mine || transaction.proposerId === user.value.id)
      .filter((transaction) => matchesKeyword(`${transaction.description} ${personRef(transaction.proposerId).fullName}`, keyword))
      .filter((transaction) => canViewTransaction(user.value.id, transaction))
      .toSorted(byLedgerOrder)
    const page = paginate(rows, url, 20)
    return HttpResponse.json({ ...page, content: page.content.map((transaction) => toSummary(transaction, fundId)) })
  }),

  http.get(`${API}/clubs/:clubId/transactions/:transactionId`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const transaction = db.transactions.find((candidate) => candidate.id === params.transactionId && candidate.clubId === clubId)
    if (!transaction) return problem(404, 'Không tìm thấy giao dịch.', 'TRANSACTION_NOT_FOUND')
    if (!canViewTransaction(user.value.id, transaction)) return transactionForbidden(transaction)
    const perspective = new URL(request.url).searchParams.get('fundId') ?? undefined
    return HttpResponse.json(toDetail(transaction, user.value.id, perspective))
  }),

  http.post(`${API}/clubs/:clubId/funds/:fundId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const fund = findFund(clubId, params.fundId)
    if (!fund) return problem(404, 'Không tìm thấy quỹ.', 'FUND_NOT_FOUND')
    if (!canViewFund(user.value.id, fund)) return fundForbidden(fund)
    const body = (await request.json()) as Partial<FundTransitionRequest>
    if (body.action !== 'SETTLE') return problem(400, 'Thao tác không hợp lệ.', 'VALIDATION')
    if (!keepsLedger(user.value.id, fund.clubId)) return forbidden(fund.clubId, 'RECORD_LEDGER', 'quyết toán quỹ sự kiện')
    if (body.version !== fund.version) return problem(409, 'Quỹ vừa được người khác cập nhật. Tải lại để xem số dư mới nhất.', 'VERSION_CONFLICT')
    const blocked = settleBlocker(fund)
    if (blocked) return blocked
    settleFund(fund, user.value.id)
    return HttpResponse.json(toFundDetail(fund, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/transactions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const body = (await request.json()) as Partial<CreateTransactionRequest>
    const fund = findFund(clubId, body.fundId)
    if (!fund) return problem(404, 'Không tìm thấy quỹ.', 'FUND_NOT_FOUND')
    switch (body.type) {
      case 'INCOME':
        return recordIncome(body, fund, user.value.id)
      case 'EXPENSE':
        return proposeExpense(body, fund, user.value.id)
      case 'ADJUSTMENT':
        return createAdjustment(body, fund, user.value.id)
      default:
        return problem(400, 'Loại giao dịch không hợp lệ.', 'VALIDATION', [{ field: 'type', message: 'Loại giao dịch không hợp lệ.' }])
    }
  }),

  http.post(`${API}/clubs/:clubId/transactions/:transactionId/transitions`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    const transaction = db.transactions.find((candidate) => candidate.id === params.transactionId && candidate.clubId === clubId)
    if (!transaction) return problem(404, 'Không tìm thấy giao dịch.', 'TRANSACTION_NOT_FOUND')
    if (!canViewTransaction(user.value.id, transaction)) return transactionForbidden(transaction)
    return transitionTransaction(transaction, (await request.json()) as Partial<TransactionTransitionRequest>, user.value.id)
  }),

  http.post(`${API}/clubs/:clubId/transaction-attachments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = clubGate(user.value.id, clubId)
    if (denied) return denied
    // Kiểm tra quyền trước khi đọc tệp để người không có quyền không đẩy được dữ liệu lên.
    if (!canUploadVoucher(user.value.id, clubId)) return problem(403, 'Bạn không có quyền ghi thu, chi ở CLB này nên không tải được chứng từ.', 'FORBIDDEN')
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return problem(400, 'Thiếu tệp chứng từ.', 'VALIDATION')
    const check = validateUploadFile(file)
    if (!check.ok) return problem(400, check.message, 'INVALID_FILE')
    const stored = { id: newId('f'), name: file.name, size: file.size, contentType: file.type, uploadedBy: user.value.id, uploadedAt: nowIso(), voucherClubId: clubId }
    db.attachments.push(stored)
    const ref: FileRef = { id: stored.id, name: stored.name, size: stored.size, contentType: stored.contentType }
    return HttpResponse.json(ref, { status: 201 })
  }),
]

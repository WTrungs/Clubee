import type { TransactionFlow } from '@/features/finance/model/financeTypes'
import { db, type DbFund, type DbTransaction } from './db'
import { can, canAnywhere, holdersOf, type AccessScope } from './mockAccess'
import { canAccessClub } from './mockMembers'
import { DEPARTMENT_ROLES, isBoardMember, positionsIn } from './mockPermissions'
import { isCoHostBoard, isEventLead, isEventStaff } from './mockStaffEvents'
import { nowIso } from './mockTime'
import { eventFundId, generalFundId } from './seed/financeSeed'

/** Khoản chưa xong: còn chờ duyệt hoặc đã duyệt mà chưa ghi sổ. */
export const PENDING_STATUSES: DbTransaction['status'][] = ['PROPOSED', 'APPROVED']

/** Số dư bằng tiền vào trừ tiền ra của các giao dịch Đã ghi sổ, tính lại mỗi lần đọc (BR-FIN-02). */
export function fundBalance(fundId: string): number {
  let balance = 0
  for (const transaction of db.transactions) {
    if (transaction.status !== 'POSTED') continue
    if (transaction.fundId === fundId) balance += transaction.direction === 'IN' ? transaction.amount : -transaction.amount
    else if (transaction.targetFundId === fundId) balance += transaction.amount
  }
  return balance
}

/** Chiều tiền nhìn từ một quỹ: giao dịch chuyển quỹ là tiền vào với quỹ nhận. */
export function flowFor(transaction: DbTransaction, fundId?: string): TransactionFlow {
  return fundId !== undefined && transaction.targetFundId === fundId ? 'IN' : transaction.direction
}

export function pendingCountOf(fundId: string): number {
  return db.transactions.filter((transaction) => transaction.fundId === fundId && PENDING_STATUSES.includes(transaction.status)).length
}

/** Mỗi CLB có đúng một Quỹ chung, tạo cùng CLB. */
export function createGeneralFund(clubId: string): DbFund {
  const fund: DbFund = {
    id: generalFundId(clubId),
    clubId,
    kind: 'GENERAL',
    eventId: null,
    status: 'OPEN',
    createdAt: nowIso(),
    settledAt: null,
    settledBy: null,
    version: 1,
  }
  db.funds.push(fund)
  return fund
}

export function eventFundOf(eventId: string): DbFund | undefined {
  return db.funds.find((fund) => fund.eventId === eventId)
}

/** Quỹ sự kiện có từ khi sự kiện sang Đã duyệt; gọi lại thì trả quỹ sẵn có. */
export function ensureEventFund(eventId: string, clubId: string): DbFund {
  const existing = eventFundOf(eventId)
  if (existing) return existing
  const fund: DbFund = {
    id: eventFundId(eventId),
    clubId,
    kind: 'EVENT',
    eventId,
    status: 'OPEN',
    createdAt: nowIso(),
    settledAt: null,
    settledBy: null,
    version: 1,
  }
  db.funds.push(fund)
  return fund
}

export function eventOfFund(fund: DbFund) {
  return fund.eventId ? db.events.find((event) => event.id === fund.eventId) : undefined
}

export function fundName(fund: DbFund): string {
  return fund.kind === 'GENERAL' ? 'Quỹ chung' : `Quỹ ${eventOfFund(fund)?.name ?? 'sự kiện'}`
}

/** Phạm vi của quỹ: Quỹ chung thuộc cả CLB, quỹ sự kiện thuộc sự kiện đó (SRS 3.1). */
export function fundScope(fund: Pick<DbFund, 'kind' | 'eventId'>): AccessScope {
  return fund.kind === 'EVENT' && fund.eventId ? { type: 'EVENT', id: fund.eventId } : { type: 'CLUB' }
}

/** Ghi thu, ghi sổ chi, điều chỉnh, quyết toán; mặc định chỉ Thủ quỹ (SRS 3.2). */
export function keepsLedger(userId: string, clubId: string): boolean {
  return can(userId, clubId, 'RECORD_LEDGER')
}

/** Duyệt, từ chối khoản chi và điều chỉnh giảm ở quỹ này; người đề xuất không tự duyệt được (BR-ACL-01, kiểm ở handler). */
export function canApproveIn(userId: string, fund: DbFund): boolean {
  return can(userId, fund.clubId, 'APPROVE_EXPENSE', fundScope(fund))
}

/** Người nhận thông báo khoản cần duyệt ở quỹ này. */
export function approversOf(fund: DbFund): string[] {
  return holdersOf(fund.clubId, 'APPROVE_EXPENSE', fundScope(fund))
}

/** Người nhận thông báo khoản chờ ghi sổ. */
export function ledgerKeepersOf(clubId: string): string[] {
  return holdersOf(clubId, 'RECORD_LEDGER')
}

/** Trưởng ban, Phó ban đang giữ chức ở CLB (được đề xuất chi từ Quỹ chung, FR-FIN-02). */
export function isDepartmentLead(userId: string, clubId: string): boolean {
  return positionsIn(userId, clubId).some((position) => position.role === 'DEPARTMENT_HEAD' || position.role === 'DEPARTMENT_VICE_HEAD')
}

/** Quỹ chung: mọi thành viên; quỹ sự kiện: ban chủ nhiệm và BTC của sự kiện (SRS 3.5), ban chủ nhiệm CLB đồng tổ chức chỉ xem (FR-EVT-09). */
export function canViewFund(userId: string, fund: DbFund): boolean {
  if (fund.kind === 'GENERAL') return canAccessClub(userId, fund.clubId)
  if (isBoardMember(userId, fund.clubId)) return true
  const event = eventOfFund(fund)
  return event !== undefined && (isEventLead(userId, event) || isEventStaff(userId, event) || isCoHostBoard(userId, event))
}

/** Xem được mọi khoản chưa ghi sổ của quỹ: ban chủ nhiệm, và Trưởng BTC với quỹ sự kiện của mình. */
export function canViewRequests(userId: string, fund: DbFund): boolean {
  if (isBoardMember(userId, fund.clubId)) return true
  const event = eventOfFund(fund)
  return event !== undefined && isEventLead(userId, event)
}

/** Người được biết có CLB này: thành viên, hoặc BTC của một sự kiện còn hoạt động (CTV, CLB đồng tổ chức). */
export function canReachClubFinance(userId: string, clubId: string): boolean {
  return canAccessClub(userId, clubId) || db.funds.some((fund) => fund.clubId === clubId && fund.kind === 'EVENT' && canViewFund(userId, fund))
}

/** Giao dịch Đã ghi sổ: ai xem được quỹ (một trong hai quỹ với chuyển quỹ); khoản chưa ghi sổ: ban chủ nhiệm, người tạo, Trưởng BTC của quỹ sự kiện đó. */
export function canViewTransaction(userId: string, transaction: DbTransaction): boolean {
  const fund = db.funds.find((candidate) => candidate.id === transaction.fundId)
  if (!fund) return false
  if (transaction.status === 'POSTED') {
    const target = transaction.targetFundId ? db.funds.find((candidate) => candidate.id === transaction.targetFundId) : undefined
    return canViewFund(userId, fund) || (target !== undefined && canViewFund(userId, target))
  }
  if (canViewRequests(userId, fund)) return true
  return transaction.proposerId === userId && canAccessClub(userId, fund.clubId)
}

/** FR-FIN-02 theo mặc định: ban chủ nhiệm ở mọi quỹ, Trưởng ban và Phó ban ở Quỹ chung, Trưởng BTC ở quỹ sự kiện của mình. */
export function canProposeIn(userId: string, fund: DbFund): boolean {
  // Quỹ chung không thuộc ban nào, nên Trưởng ban, Phó ban có quyền đề xuất ở ban mình thì đề xuất được từ Quỹ chung.
  if (fund.kind === 'GENERAL') return can(userId, fund.clubId, 'PROPOSE_EXPENSE') || canAnywhere(userId, fund.clubId, 'PROPOSE_EXPENSE', DEPARTMENT_ROLES)
  return can(userId, fund.clubId, 'PROPOSE_EXPENSE', fundScope(fund))
}

/** Ai có thể tạo giao dịch ở CLB, hoặc đang giữ tiền tạm ứng cần nộp chứng từ quyết toán (FR-FIN-08), thì được tải chứng từ lên trước. */
export function canUploadVoucher(userId: string, clubId: string): boolean {
  // Liệt kê lại trạng thái giữ tiền thay vì dùng `HELD_STATUSES`: mockAdvances đã import file này, import ngược sẽ thành vòng.
  const holdsAdvance = db.advances.some(
    (advance) => advance.clubId === clubId && advance.requesterId === userId && (advance.status === 'DISBURSED' || advance.status === 'PARTIALLY_SETTLED'),
  )
  return keepsLedger(userId, clubId) || canAnywhere(userId, clubId, 'PROPOSE_EXPENSE') || (holdsAdvance && canAccessClub(userId, clubId))
}

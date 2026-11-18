import type { AdvanceAction, AdvanceDetail, AdvanceSummary } from '@/features/finance/model/advanceTypes'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { db, type DbFund } from './db'
import { canApproveIn, canProposeIn, eventOfFund, fundName, keepsLedger, ledgerKeepersOf } from './mockFinance'
import { canAccessClub, personRef } from './mockMembers'
import { notify } from './mockNotifications'
import { isBoardMember } from './mockPermissions'
import { registerJob, SYSTEM_ACTOR } from './mockSchedule'
import { isEventLead } from './mockStaffEvents'
import { shiftDate, vnToday } from './mockTime'
import type { DbAdvance } from './seed/advanceSeed'

/** Số ngày trước hạn quyết toán thì nhắc người ứng (FR-FIN-07). */
export const ADVANCE_REMIND_DAYS = 2
/** Hạn quyết toán xa nhất tính từ hôm nay. */
export const ADVANCE_SETTLE_MAX_DAYS = 90

/** Tạm ứng còn mở: chưa Đã quyết toán, chưa bị từ chối (chặn quyết toán quỹ, đóng sự kiện, xin rời ở FR-FIN-08). */
export const OPEN_ADVANCE_STATUSES: DbAdvance['status'][] = ['PROPOSED', 'APPROVED', 'DISBURSED', 'PARTIALLY_SETTLED']
/** Tiền đang nằm ở người ứng: Đã ứng hoặc Quyết toán một phần. */
const HELD_STATUSES: DbAdvance['status'][] = ['DISBURSED', 'PARTIALLY_SETTLED']

export const fundOfAdvance = (advance: Pick<DbAdvance, 'fundId'>) => db.funds.find((fund) => fund.id === advance.fundId)

/** BR-FIN-05: quá hạn khi tiền còn ở người ứng mà đã qua hạn quyết toán; tính lúc đọc. */
export function isAdvanceOverdue(advance: DbAdvance, today = vnToday()): boolean {
  return HELD_STATUSES.includes(advance.status) && advance.settleBy < today
}

/** Khoản quá hạn đầu tiên của người này ở CLB, để câu báo nêu đúng khoản (BR-FIN-05). */
export function overdueAdvanceOf(userId: string, clubId: string): DbAdvance | undefined {
  return db.advances.find((advance) => advance.clubId === clubId && advance.requesterId === userId && isAdvanceOverdue(advance))
}

/** Ban chủ nhiệm xem hết; Trưởng BTC xem tạm ứng ở quỹ sự kiện của mình; người ứng xem của mình khi còn với tới CLB (SRS 3.5). */
export function canViewAdvance(userId: string, advance: DbAdvance): boolean {
  if (isBoardMember(userId, advance.clubId)) return true
  if (advance.requesterId === userId && canAccessClub(userId, advance.clubId)) return true
  const fund = fundOfAdvance(advance)
  const event = fund ? eventOfFund(fund) : undefined
  return event !== undefined && isEventLead(userId, event)
}

/** Xem danh sách tạm ứng của quỹ: ban chủ nhiệm, Trưởng BTC với quỹ sự kiện của mình, người đề xuất được (để theo dõi khoản của mình). */
export function canListAdvances(userId: string, fund: DbFund): boolean {
  if (isBoardMember(userId, fund.clubId) || canProposeIn(userId, fund)) return true
  const event = eventOfFund(fund)
  return (event !== undefined && isEventLead(userId, event)) || db.advances.some((advance) => advance.fundId === fund.id && advance.requesterId === userId)
}

function advanceActions(userId: string, advance: DbAdvance): AdvanceAction[] {
  const fund = fundOfAdvance(advance)
  if (!fund) return []
  const actions: AdvanceAction[] = []
  // Người đề xuất không tự duyệt khoản của mình (FR-FIN-07, cùng tinh thần BR-ACL-01).
  if (advance.status === 'PROPOSED' && advance.requesterId !== userId && canApproveIn(userId, fund)) actions.push('APPROVE', 'REJECT')
  if (advance.status === 'APPROVED' && fund.status === 'OPEN' && keepsLedger(userId, fund.clubId)) actions.push('DISBURSE')
  return actions
}

const refOrNull = (userId: string | null) => (userId ? personRef(userId) : null)

export function toAdvanceSummary(advance: DbAdvance): AdvanceSummary {
  const fund = fundOfAdvance(advance)
  return {
    id: advance.id,
    fundId: advance.fundId,
    fundName: fund ? fundName(fund) : '',
    requester: personRef(advance.requesterId),
    amount: advance.amount,
    purpose: advance.purpose,
    category: advance.category,
    settleBy: advance.settleBy,
    status: advance.status,
    overdue: isAdvanceOverdue(advance),
    createdAt: advance.createdAt,
  }
}

export function toAdvanceDetail(advance: DbAdvance, userId: string): AdvanceDetail {
  return {
    ...toAdvanceSummary(advance),
    approver: refOrNull(advance.approverId),
    decidedAt: advance.decidedAt,
    rejectionReason: advance.rejectionReason,
    disbursedBy: refOrNull(advance.disbursedBy),
    disbursedOn: advance.disbursedOn,
    disbursementTxId: advance.disbursementTxId,
    allowedActions: advanceActions(userId, advance),
    version: advance.version,
  }
}

/** Trang đích của thông báo tạm ứng; trang đó gọi chi tiết, máy chủ kiểm lại `canViewAdvance` (BR-SEC-02). */
export const advanceTarget = (advance: DbAdvance) => ({ type: 'ADVANCE' as const, clubId: advance.clubId, id: advance.id })

/** FR-FIN-07: nhắc người ứng khi còn `ADVANCE_REMIND_DAYS` ngày, báo một lần khi quá hạn cho người ứng và người giữ sổ. */
export function runAdvanceDeadlines(): void {
  const today = vnToday()
  for (const advance of db.advances) {
    if (!HELD_STATUSES.includes(advance.status)) continue
    const base = { clubId: advance.clubId, category: 'FINANCE' as const, target: advanceTarget(advance), actorId: SYSTEM_ACTOR }
    const amount = formatMoney(advance.amount)
    if (advance.settleBy >= today && advance.settleBy <= shiftDate(today, ADVANCE_REMIND_DAYS) && advance.remindedFor !== advance.settleBy) {
      advance.remindedFor = advance.settleBy
      notify([advance.requesterId], { ...base, title: `Tạm ứng sắp tới hạn quyết toán: ${advance.purpose}`, body: `${amount}, hạn ${formatDate(advance.settleBy)}.` })
    }
    if (isAdvanceOverdue(advance, today) && advance.overdueNotifiedFor !== advance.settleBy) {
      advance.overdueNotifiedFor = advance.settleBy
      const title = `Tạm ứng quá hạn quyết toán: ${advance.purpose}`
      const body = `${personRef(advance.requesterId).fullName}, ${amount}, hạn ${formatDate(advance.settleBy)}.`
      notify([advance.requesterId, ...ledgerKeepersOf(advance.clubId)], { ...base, title, body })
    }
  }
}

registerJob('advanceDeadlines', runAdvanceDeadlines)

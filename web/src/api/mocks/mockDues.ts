import { DUES_REMIND_DAYS, remainingDue } from '@/features/finance/model/duesRules'
import type { DuesCampaignAction, DuesCampaignDetail, DuesCampaignSummary, DuesItem, DuesItemStatus } from '@/features/finance/model/duesTypes'
import { formatDate } from '@/shared/format/formatDate'
import { formatMoney } from '@/shared/format/formatMoney'
import { db } from './db'
import { keepsLedger } from './mockFinance'
import { personRef } from './mockMembers'
import { notify } from './mockNotifications'
import { isBoardMember } from './mockPermissions'
import { registerJob, SYSTEM_ACTOR } from './mockSchedule'
import { nowIso, shiftDate, vnToday } from './mockTime'
import type { DbDuesCampaign, DbDuesItem } from './seed/duesSeed'

/** Số đã nộp của một người trong đợt. */
export const paidOf = (item: Pick<DbDuesItem, 'payments'>) => item.payments.reduce((sum, payment) => sum + payment.amount, 0)

/** Miễn → Đã miễn; nộp đủ mức sau miễn giảm → Đã nộp; nộp một phần; còn lại là Chưa nộp. */
export function duesItemStatus(item: Pick<DbDuesItem, 'exemption' | 'amountDue' | 'payments'>): DuesItemStatus {
  if (item.exemption?.kind === 'EXEMPT') return 'EXEMPT'
  const paid = paidOf(item)
  if (paid >= item.amountDue) return 'PAID'
  return paid > 0 ? 'PARTIAL' : 'UNPAID'
}

export const itemsOf = (campaignId: string) => db.duesItems.filter((item) => item.campaignId === campaignId)

/** Xem đợt đóng quỹ: ban chủ nhiệm (SRS 3.5); thao tác cần `RECORD_LEDGER`. */
export const canViewDues = (userId: string, clubId: string) => isBoardMember(userId, clubId)

export function toDuesItem(item: DbDuesItem): DuesItem {
  return {
    id: item.id,
    member: { id: item.userId, fullName: item.memberName },
    departmentName: item.departmentName,
    amountDue: item.amountDue,
    paidAmount: paidOf(item),
    status: duesItemStatus(item),
    exemption: item.exemption ? { kind: item.exemption.kind, reason: item.exemption.reason, by: personRef(item.exemption.by), at: item.exemption.at } : null,
    payments: item.payments.toReversed().map((payment) => ({ ...payment, confirmedBy: personRef(payment.confirmedBy) })),
    version: item.version,
  }
}

export function toDuesSummary(campaign: DbDuesCampaign): DuesCampaignSummary {
  const items = itemsOf(campaign.id)
  return {
    id: campaign.id,
    name: campaign.name,
    amount: campaign.amount,
    dueOn: campaign.dueOn,
    status: campaign.status,
    memberCount: items.length,
    settledCount: items.filter((item) => ['PAID', 'EXEMPT'].includes(duesItemStatus(item))).length,
    expectedAmount: items.reduce((sum, item) => sum + item.amountDue, 0),
    collectedAmount: items.reduce((sum, item) => sum + paidOf(item), 0),
    openedAt: campaign.openedAt,
    closedAt: campaign.closedAt,
  }
}

export const hasPayments = (campaignId: string) => itemsOf(campaignId).some((item) => item.payments.length > 0)

function campaignActions(userId: string, campaign: DbDuesCampaign): DuesCampaignAction[] {
  if (campaign.status !== 'OPEN' || !keepsLedger(userId, campaign.clubId)) return []
  const actions: DuesCampaignAction[] = ['EDIT']
  if (!hasPayments(campaign.id)) actions.push('EDIT_AMOUNT')
  actions.push('SET_EXEMPTION', 'RECORD_PAYMENT', 'CLOSE')
  return actions
}

export function toDuesDetail(campaign: DbDuesCampaign, userId: string): DuesCampaignDetail {
  return {
    ...toDuesSummary(campaign),
    openedBy: personRef(campaign.openedBy),
    closedBy: campaign.closedBy ? personRef(campaign.closedBy) : null,
    hasPayments: hasPayments(campaign.id),
    allowedActions: campaignActions(userId, campaign),
    version: campaign.version,
  }
}

/** Đích thông báo đợt đóng quỹ: tab Đóng quỹ; người không có `VIEW_DUES` thì trang mở Khoản đóng của tôi (FR-FIN-13). */
export const duesTarget = (campaign: Pick<DbDuesCampaign, 'clubId' | 'id'>) => ({ type: 'DUES' as const, clubId: campaign.clubId, id: campaign.id })

/** Số còn thiếu của một người. */
export const owedOf = (item: Pick<DbDuesItem, 'amountDue' | 'payments'>) => remainingDue({ amountDue: item.amountDue, paidAmount: paidOf(item) })

/**
 * FR-FIN-10: nhắc người còn thiếu một lần khi còn `DUES_REMIND_DAYS` ngày tới hạn và một lần khi quá hạn. Đợt đã đóng, người được
 * miễn hoặc đã nộp đủ thì không nhắc.
 */
export function runDuesReminders(): void {
  const today = vnToday()
  for (const campaign of db.duesCampaigns) {
    if (campaign.status !== 'OPEN') continue
    const soon = campaign.dueOn >= today && campaign.dueOn <= shiftDate(today, DUES_REMIND_DAYS)
    const overdue = campaign.dueOn < today
    if (!soon && !overdue) continue
    for (const item of itemsOf(campaign.id)) {
      const owed = owedOf(item)
      if (owed === 0) continue
      const base = { clubId: campaign.clubId, category: 'FINANCE' as const, target: duesTarget(campaign), actorId: SYSTEM_ACTOR }
      if (overdue && item.remindedOverdueAt === null) {
        item.remindedOverdueAt = nowIso()
        notify([item.userId], { ...base, title: `Quá hạn đóng quỹ: ${campaign.name}`, body: `Bạn còn thiếu ${formatMoney(owed)}, hạn nộp đã qua ngày ${formatDate(campaign.dueOn)}.` })
      } else if (soon && item.remindedSoonAt === null) {
        item.remindedSoonAt = nowIso()
        notify([item.userId], { ...base, title: `Sắp tới hạn đóng quỹ: ${campaign.name}`, body: `Bạn còn thiếu ${formatMoney(owed)}, hạn nộp ${formatDate(campaign.dueOn)}.` })
      }
    }
  }
}

registerJob('duesReminders', runDuesReminders)

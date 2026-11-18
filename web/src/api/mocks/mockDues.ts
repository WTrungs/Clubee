import type { DuesCampaignAction, DuesCampaignDetail, DuesCampaignSummary, DuesItem, DuesItemStatus } from '@/features/finance/model/duesTypes'
import { db } from './db'
import { keepsLedger } from './mockFinance'
import { personRef } from './mockMembers'
import { isBoardMember } from './mockPermissions'
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

/**
 * Trang đích thông báo đợt đóng quỹ: tab Đóng quỹ của trang Tài chính. Người không có `VIEW_DUES` (thành viên phải đóng) thì
 * trang tự về sổ Quỹ chung; nội dung thông báo đã nêu kỳ, mức, hạn của chính họ.
 */
export const duesTarget = (campaign: Pick<DbDuesCampaign, 'clubId' | 'id'>) => ({ type: 'DUES' as const, clubId: campaign.clubId, id: campaign.id })

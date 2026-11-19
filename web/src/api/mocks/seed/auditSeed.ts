import type { TransactionStatus } from '@/features/finance/model/financeTypes'
import { membershipAuditLabel, positionAuditLabel, transactionAuditLabel, userNameOf, type AuditLabelSource } from '../auditLabels'
import type { DbAuditLog, DbTransaction, MockDb } from '../db'
import { SYSTEM_ACTOR } from '../mockSchedule'

export type AuditSeedSource = AuditLabelSource & Pick<MockDb, 'positions' | 'memberships' | 'transactions'>

type SeedEntry = Omit<DbAuditLog, 'id' | 'actorName'>

/** Các lần đổi trạng thái của một giao dịch mẫu, dựng lại từ mốc thời gian đã lưu; mốc nào không lưu (ví dụ lúc rút) thì bỏ qua. */
function transactionTrail(source: AuditSeedSource, transaction: DbTransaction): SeedEntry[] {
  const base = { clubId: transaction.clubId, objectType: 'TRANSACTION' as const, objectId: transaction.id, objectLabel: transactionAuditLabel(source, transaction) }
  const change = (at: string, actorId: string, from: TransactionStatus, to: TransactionStatus, reason: string | null = null): SeedEntry => ({
    ...base,
    at,
    actorId,
    action: 'CHANGE_TRANSACTION_STATUS',
    before: { status: from },
    after: { status: to },
    reason,
  })
  // Khoản thu, chuyển quỹ, điều chỉnh tăng ghi sổ ngay lúc tạo, không qua bước duyệt.
  const postedOnCreate = transaction.status === 'POSTED' && transaction.decidedAt === null
  const entries: SeedEntry[] = [
    {
      ...base,
      at: transaction.createdAt,
      actorId: transaction.proposerId,
      action: 'CREATE_TRANSACTION',
      before: null,
      after: { status: postedOnCreate ? 'POSTED' : 'PROPOSED', amount: transaction.amount },
      reason: null,
    },
  ]
  if (postedOnCreate || !transaction.decidedAt || !transaction.approverId) return entries
  if (transaction.status === 'REJECTED') return [...entries, change(transaction.decidedAt, transaction.approverId, 'PROPOSED', 'REJECTED', transaction.rejectionReason)]
  // Điều chỉnh giảm được duyệt là ghi sổ luôn.
  const approvedTo: TransactionStatus = transaction.type === 'ADJUSTMENT' ? 'POSTED' : 'APPROVED'
  entries.push(change(transaction.decidedAt, transaction.approverId, 'PROPOSED', approvedTo))
  if (approvedTo === 'APPROVED' && transaction.status === 'POSTED' && transaction.postedAt && transaction.posterId) {
    entries.push(change(transaction.postedAt, transaction.posterId, 'APPROVED', 'POSTED'))
  }
  if (transaction.status === 'CANCELLED' && transaction.cancelledAt && transaction.cancelledBy) {
    entries.push(change(transaction.cancelledAt, transaction.cancelledBy, 'APPROVED', 'CANCELLED', transaction.cancellationReason))
  }
  return entries
}

/** Bỏ lần thu hồi chức vụ vì seed không lưu người thu hồi; xếp theo thời gian để thứ tự ghi thêm khớp thứ tự thời gian. */
export function createAuditSeed(source: AuditSeedSource): DbAuditLog[] {
  const entries: SeedEntry[] = [
    ...source.positions.map(
      (position): SeedEntry => ({
        at: `${position.startOn}T08:00:00+07:00`,
        actorId: position.assignedBy ?? SYSTEM_ACTOR,
        clubId: position.clubId,
        action: 'GRANT_POSITION',
        objectType: 'POSITION',
        objectId: position.id,
        objectLabel: positionAuditLabel(source, position),
        before: null,
        after: { startOn: position.startOn, endOn: position.endOn },
        reason: null,
      }),
    ),
    ...source.memberships.flatMap((membership) =>
      membership.history.map(
        (change): SeedEntry => ({
          at: change.at,
          actorId: change.actorId,
          clubId: membership.clubId,
          action: 'CHANGE_MEMBER_STATUS',
          objectType: 'MEMBERSHIP',
          objectId: membership.id,
          objectLabel: membershipAuditLabel(source, membership),
          before: change.fromStatus ? { status: change.fromStatus } : null,
          after: { status: change.toStatus },
          reason: change.reason,
        }),
      ),
    ),
    ...source.transactions.flatMap((transaction) => transactionTrail(source, transaction)),
  ]
  return entries
    .toSorted((a, b) => a.at.localeCompare(b.at))
    .map((entry, index) => ({ id: `log-seed-${index + 1}`, actorName: userNameOf(source, entry.actorId), ...entry }))
}

import type { TransactionType } from '@/features/finance/model/financeTypes'
import { formatMoney } from '@/shared/format/formatMoney'
import type { DbMembership, DbPosition, DbTransaction, MockDb } from './db'
import { SYSTEM_ACTOR } from './mockSchedule'
import { positionTitles } from './seed/orgSeed'

/** Nhận nguồn dữ liệu thay vì đọc `db` để `db.ts` dựng được nhật ký mẫu lúc tạo seed mà không import ngược chính nó. */
export type AuditLabelSource = Pick<MockDb, 'users' | 'departments' | 'events' | 'subcommittees' | 'funds'>

const TRANSACTION_KINDS: Record<TransactionType, string> = {
  INCOME: 'Khoản thu',
  EXPENSE: 'Khoản chi',
  ADJUSTMENT: 'Điều chỉnh',
  TRANSFER: 'Chuyển quỹ',
}

export function userNameOf(source: Pick<MockDb, 'users'>, userId: string): string {
  if (userId === SYSTEM_ACTOR) return 'Hệ thống'
  return source.users.find((user) => user.id === userId)?.fullName ?? 'Người dùng không còn tồn tại'
}

/** Ví dụ "Trưởng ban Truyền thông: Đặng Thị Linh", "Trưởng tiểu ban Hậu cần (Đêm nhạc Mùa đông): …". */
export function positionAuditLabel(source: AuditLabelSource, position: DbPosition): string {
  const department = source.departments.find((candidate) => candidate.id === position.scopeId)
  const event = source.events.find((candidate) => candidate.id === position.scopeId)
  const subcommittee = source.subcommittees.find((candidate) => candidate.id === position.scopeId)
  const subcommitteeEvent = subcommittee ? source.events.find((candidate) => candidate.id === subcommittee.eventId) : undefined
  const subcommitteeName = subcommittee ? `${subcommittee.name}${subcommitteeEvent ? ` (${subcommitteeEvent.name})` : ''}` : null
  const scope = department?.name ?? event?.name ?? subcommitteeName
  return `${positionTitles[position.role]}${scope ? ` ${scope}` : ''}: ${userNameOf(source, position.userId)}`
}

export const membershipAuditLabel = (source: AuditLabelSource, membership: Pick<DbMembership, 'userId'>) =>
  `Tư cách thành viên của ${userNameOf(source, membership.userId)}`

/** Ví dụ "Khoản chi 400.000 đ ở Quỹ chung: Mua dây đàn". */
export function transactionAuditLabel(source: AuditLabelSource, transaction: DbTransaction): string {
  const fund = source.funds.find((candidate) => candidate.id === transaction.fundId)
  const event = fund?.kind === 'EVENT' ? source.events.find((candidate) => candidate.id === fund.eventId) : undefined
  const fundName = fund?.kind === 'EVENT' ? `Quỹ ${event?.name ?? 'sự kiện'}` : 'Quỹ chung'
  return `${TRANSACTION_KINDS[transaction.type]} ${formatMoney(transaction.amount)} ở ${fundName}: ${transaction.description}`
}

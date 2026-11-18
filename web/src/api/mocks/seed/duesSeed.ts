import type { DuesCampaignStatus, DuesExemptionKind } from '@/features/finance/model/duesTypes'
import { vnDate, vnDayAt } from '../mockTime'
import type { DbDepartment } from './orgSeed'
import type { DbMembership, DbUser } from './memberSeed'

/** Đợt đóng quỹ (FR-FIN-09). Dữ liệu tổng hợp. */
export interface DbDuesCampaign {
  id: string
  clubId: string
  name: string
  amount: number
  dueOn: string
  status: DuesCampaignStatus
  openedBy: string
  openedAt: string
  closedBy: string | null
  closedAt: string | null
  version: number
}

/** Một khoản nộp (FR-FIN-10); mỗi khoản sinh một khoản thu Đã ghi sổ. */
export interface DbDuesPayment {
  id: string
  amount: number
  paidOn: string
  recordedBy: string
  recordedAt: string
  transactionId: string
}

/** Một người trong đợt; họ tên, ban, mức phải đóng chụp lúc mở đợt (BR-DATA-02). */
export interface DbDuesItem {
  id: string
  campaignId: string
  clubId: string
  membershipId: string
  userId: string
  memberName: string
  departmentName: string | null
  /** Mức phải đóng sau miễn giảm; 0 khi được miễn. */
  amountDue: number
  exemption: { kind: DuesExemptionKind; reason: string; by: string; at: string } | null
  payments: DbDuesPayment[]
  /** Đã nhắc sắp tới hạn (FR-FIN-10). */
  remindedSoonAt: string | null
  /** Đã nhắc quá hạn. */
  remindedOverdueAt: string | null
  version: number
}

/** Thành viên phải đóng quỹ: Thử việc và Chính thức (FR-FIN-09). */
export const DUES_MEMBER_STATUSES: DbMembership['status'][] = ['PROBATION', 'ACTIVE']

/** Một đợt đang mở của CLB Guitar, chưa ai nộp; danh sách chụp từ thành viên seed. */
export function createDuesSeed({ memberships, users, departments }: { memberships: DbMembership[]; users: DbUser[]; departments: DbDepartment[] }) {
  const campaign: DbDuesCampaign = {
    id: 'dues-guitar-hk1',
    clubId: 'c-guitar',
    name: 'Quỹ học kỳ 1',
    amount: 100_000,
    dueOn: vnDate(10),
    status: 'OPEN',
    openedBy: 'u-mai',
    openedAt: vnDayAt(-3, 9),
    closedBy: null,
    closedAt: null,
    version: 1,
  }
  const items: DbDuesItem[] = memberships
    .filter((membership) => membership.clubId === campaign.clubId && DUES_MEMBER_STATUSES.includes(membership.status))
    .map((membership) => ({
      id: `dues-item-${membership.id}`,
      campaignId: campaign.id,
      clubId: campaign.clubId,
      membershipId: membership.id,
      userId: membership.userId,
      memberName: users.find((user) => user.id === membership.userId)?.fullName ?? '',
      departmentName: departments.find((department) => department.id === membership.departmentId)?.name ?? null,
      amountDue: campaign.amount,
      exemption: null,
      payments: [],
      remindedSoonAt: null,
      remindedOverdueAt: null,
      version: 1,
    }))
  return { duesCampaigns: [campaign], duesItems: items }
}

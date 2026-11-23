import type { PersonRef } from '@/api/commonTypes'
import type { MemberStatus } from '@/features/account/model/accountTypes'
import type { MyClubMembership } from '@/features/club/model/clubTypes'
import { matchesKeyword } from '@/shared/lib/searchText'
import { membershipAuditLabel } from './auditLabels'
import { db, type DbDepartment, type DbMembership } from './db'
import { audit } from './mockAudit'
import { nowIso, shiftDate } from './mockTime'

/** Nguồn chung về tư cách thành viên cho mọi handler (Công việc, Sự kiện, Thành viên, Cơ cấu). */
export const ROSTER_STATUSES: MemberStatus[] = ['PROBATION', 'ACTIVE', 'ON_LEAVE']
export const WORKING_STATUSES: MemberStatus[] = ['PROBATION', 'ACTIVE']

export interface MemberOption {
  id: string
  fullName: string
  departmentName: string | null
}

/** Tư cách đang hoạt động (kể cả Chờ duyệt); mỗi người tối đa một tư cách như vậy ở một CLB (BR-MEM-01). */
export function membershipOf(userId: string, clubId: string): DbMembership | undefined {
  return db.memberships.find((membership) => membership.userId === userId && membership.clubId === clubId && membership.status !== 'LEFT')
}

/** Tư cách gần nhất của người dùng ở CLB, để danh bạ và trang lời mời hiện Chờ duyệt, Đang là thành viên hoặc lý do bị từ chối. */
export function myMembershipIn(userId: string, clubId: string): MyClubMembership | null {
  const latest = db.memberships
    .filter((membership) => membership.userId === userId && membership.clubId === clubId)
    .toSorted((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0]
  if (!latest) return null
  return { status: latest.status, exitKind: latest.exitKind, rejectionReason: latest.exitKind === 'REJECTED' ? latest.leaveReason : null }
}

/** Thành viên Thử việc hoặc Chính thức: được nhận việc, đăng ký, đề xuất (BR-MEM-05). */
export function isActiveMember(userId: string, clubId: string): boolean {
  const status = membershipOf(userId, clubId)?.status
  return status !== undefined && WORKING_STATUSES.includes(status)
}

/** Được xem dữ liệu nội bộ CLB khi có tư cách Thử việc, Chính thức hoặc Tạm nghỉ (BR-SEC-01). */
export function canAccessClub(userId: string, clubId: string): boolean {
  const status = membershipOf(userId, clubId)?.status
  return status !== undefined && ROSTER_STATUSES.includes(status)
}

export function memberCountOf(clubId: string): number {
  return db.memberships.filter((membership) => membership.clubId === clubId && ROSTER_STATUSES.includes(membership.status)).length
}

/** Số người có ban chính là ban này; ban còn người thì chưa đóng, chưa bỏ được (BR-MEM-06). */
export function departmentMemberCount(departmentId: string): number {
  return db.memberships.filter((membership) => membership.departmentId === departmentId && ROSTER_STATUSES.includes(membership.status)).length
}

export interface MembershipChangeInput {
  actorId: string
  fromStatus: MemberStatus | null
  toStatus: MemberStatus
  reason: string | null
  /** Mốc của lần đổi; mặc định là bây giờ. */
  at?: string
}

/** Ghi một lần chuyển trạng thái tư cách vào lịch sử của tư cách và vào nhật ký thao tác (BR-MEM-02, BR-DATA-03). */
export function recordMembershipChange(membership: DbMembership, { actorId, fromStatus, toStatus, reason, at = nowIso() }: MembershipChangeInput): void {
  membership.history.push({ at, actorId, fromStatus, toStatus, reason })
  audit({
    at,
    actorId,
    clubId: membership.clubId,
    action: 'CHANGE_MEMBER_STATUS',
    objectType: 'MEMBERSHIP',
    objectId: membership.id,
    objectLabel: membershipAuditLabel(db, membership),
    before: fromStatus ? { status: fromStatus } : null,
    after: { status: toStatus },
    reason,
  })
}

/** Đóng khoảng ban chính đang mở ở ngày cuối cho trước; ngày cuối trước ngày bắt đầu là khoảng bị hủy trong ngày. */
export function closeDepartmentStint(membership: DbMembership, lastDay: string): void {
  const open = membership.departmentHistory.find((stint) => stint.toOn === null)
  if (open) open.toOn = lastDay
}

/** Mở ban chính mới từ một ngày (duyệt gia nhập hoặc chuyển ban). */
export function openDepartmentStint(membership: DbMembership, departmentId: string, fromOn: string, actorId: string): void {
  membership.departmentHistory.push({ departmentId, fromOn, toOn: null, changedBy: actorId })
  membership.departmentId = departmentId
}

/** FR-MEM-10: ban cũ kết thúc hôm qua, ban mới bắt đầu hôm nay; công việc ở ban cũ giữ nguyên. */
export function transferDepartment(membership: DbMembership, toDepartmentId: string, actorId: string, today: string): void {
  closeDepartmentStint(membership, shiftDate(today, -1))
  openDepartmentStint(membership, toDepartmentId, today, actorId)
}

/** Ban chính của người này vào một ngày, để báo cáo kỳ cũ hiện đúng ban lúc phát sinh (BR-MEM-06, BR-DATA-02). */
export function departmentOn(membership: Pick<DbMembership, 'departmentHistory'>, day: string): string | null {
  // Chuyển nhiều lần trong ngày thì khoảng giữa có ngày cuối trước ngày bắt đầu nên không khớp ngày nào.
  const stint = membership.departmentHistory.find((candidate) => candidate.fromOn <= day && (candidate.toOn === null || day <= candidate.toOn))
  return stint?.departmentId ?? null
}

export function departmentOf(userId: string, clubId: string): DbDepartment | undefined {
  const departmentId = membershipOf(userId, clubId)?.departmentId
  return db.departments.find((department) => department.id === departmentId)
}

export function departmentNameOf(userId: string, clubId: string): string | null {
  return departmentOf(userId, clubId)?.name ?? null
}

/** Họ tên giữ nguyên trong lịch sử kể cả khi người đó đã rời CLB (BR-DATA-02). */
export function personRef(userId: string): PersonRef {
  return { id: userId, fullName: db.users.find((user) => user.id === userId)?.fullName ?? 'Người dùng không còn tồn tại' }
}

/** Thành viên theo trạng thái và ban chính, sắp theo tên; chỉ tên và ban (SRS 3.5). */
export function eligibleMembers(
  clubId: string,
  { statuses = WORKING_STATUSES, departmentId, keyword }: { statuses?: MemberStatus[]; departmentId?: string; keyword?: string | null } = {},
): MemberOption[] {
  return db.memberships
    .filter((membership) => membership.clubId === clubId && statuses.includes(membership.status))
    .filter((membership) => !departmentId || membership.departmentId === departmentId)
    .map((membership) => ({ ...personRef(membership.userId), departmentName: departmentNameOf(membership.userId, clubId) }))
    .filter((member) => matchesKeyword(member.fullName, keyword))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
}

import type { PermissionKey } from '@/features/org/model/permissionTypes'
import type { DbAuditLog } from './mockAudit'
import { createAdvanceSeed, type DbAdvance } from './seed/advanceSeed'
import { createAuditSeed } from './seed/auditSeed'
import { createDuesSeed, type DbDuesCampaign, type DbDuesItem } from './seed/duesSeed'
import type { DbPermissionMatrixMeta } from './mockPermissionMatrix'
import type { DbTransferRequest } from './mockTransfers'
import {
  createAttendanceSeed,
  createAttendanceSheetSeed,
  createSessionRegistrationSeed,
  createSessionSeed,
  type DbAttendance,
  type DbAttendanceCode,
  type DbAttendanceSheet,
  type DbSession,
  type DbSessionRegistration,
} from './seed/attendanceSeed'
import { createClubSeed, type DbClub } from './seed/clubSeed'
import {
  createCoHostSeed,
  createEventSeed,
  createEventStaffSeed,
  createRegistrationSeed,
  createSubcommitteeSeed,
  type DbEvent,
  type DbEventCoHost,
  type DbEventStaff,
  type DbRegistration,
  type DbSubcommittee,
} from './seed/eventSeed'
import { createFinanceAttachmentSeed, createFundSeed, createTransactionSeed, type DbFund, type DbTransaction } from './seed/financeSeed'
import { createInvitationSeed, type DbInvitation } from './seed/invitationSeed'
import { createLeaveRequestSeed, createMembershipSeed, createUserSeed, type DbLeaveRequest, type DbMembership, type DbUser } from './seed/memberSeed'
import { createNotificationSeed, type DbNotification, type DbNotificationRecipient } from './seed/notificationSeed'
import { createDepartmentSeed, createPositionSeed, createTermSeed, type DbDepartment, type DbPosition, type DbTerm, type PositionRole } from './seed/orgSeed'
import { createAttachmentSeed, createTaskSeed, type DbAttachment, type DbTask } from './seed/taskSeed'
import type { DbHandover, DbHandoverItem } from './seed/termSeed'

/** Dữ liệu tổng hợp, không phải người thật (security.md); bản ghi ở dạng phía máy chủ, handler map sang DTO. */
export type { DbAttendance, DbAttendanceCode, DbAttendanceSheet, DbSession, DbSessionRegistration } from './seed/attendanceSeed'
export type { DbClub } from './seed/clubSeed'
export type { DbAdvance } from './seed/advanceSeed'
export type { DbDuesCampaign, DbDuesItem } from './seed/duesSeed'
export type { DbFund, DbTransaction } from './seed/financeSeed'
export type { DbInvitation } from './seed/invitationSeed'
export type { DbAuditLog } from './mockAudit'
export type { AccountStatus, AccountType, DbDepartmentStint, DbLeaveRequest, DbMemberInfoChange, DbMembership, DbMembershipChange, DbUser, MemberInfoField, MembershipExit } from './seed/memberSeed'
export type { DbNotification, DbNotificationRecipient } from './seed/notificationSeed'
export type { DbDepartment, DbPlanEntry, DbPosition, DbTerm, DepartmentStatus, PositionRole } from './seed/orgSeed'
export type { DbAppointment, DbHandover, DbHandoverItem, DbHandoverSnapshot } from './seed/termSeed'

/** Mục tồn đọng của người bị đưa ra khỏi CLB, chờ ban chủ nhiệm gán lại (FR-MEM-08, 09). */
export interface DbBacklogItem {
  id: string
  clubId: string
  membershipId: string
  formerMemberId: string
  /** Việc đang làm, việc chờ người giao nghiệm thu, hoặc chức vụ cần người thay. */
  kind: 'TASK' | 'TASK_REVIEW' | 'POSITION'
  refId: string
  createdAt: string
  /** Ban chủ nhiệm đã xử lý (FR-MEM-09); mục cũng tự thành đã xử lý khi đối tượng không cần thay nữa (`backlogState`). */
  resolution: { action: 'REASSIGN' | 'APPOINT' | 'DISMISS'; userId: string | null; reason: string | null; by: string; at: string } | null
  version: number
}

/** Ô bảng phân quyền CLB đã sửa khác mặc định (FR-ORG-05); ô trở về mặc định thì bỏ bản ghi. */
export interface DbPermissionOverride {
  clubId: string
  role: PositionRole
  permission: PermissionKey
  enabled: boolean
  updatedBy: string
  updatedAt: string
}

export interface MockDb {
  users: DbUser[]
  clubs: DbClub[]
  terms: DbTerm[]
  handovers: DbHandover[]
  handoverItems: DbHandoverItem[]
  departments: DbDepartment[]
  memberships: DbMembership[]
  leaveRequests: DbLeaveRequest[]
  invitations: DbInvitation[]
  positions: DbPosition[]
  permissionOverrides: DbPermissionOverride[]
  permissionMatrixMeta: DbPermissionMatrixMeta[]
  backlogItems: DbBacklogItem[]
  tasks: DbTask[]
  attachments: DbAttachment[]
  events: DbEvent[]
  subcommittees: DbSubcommittee[]
  eventStaff: DbEventStaff[]
  eventCoHosts: DbEventCoHost[]
  registrations: DbRegistration[]
  notifications: DbNotification[]
  notificationRecipients: DbNotificationRecipient[]
  funds: DbFund[]
  transactions: DbTransaction[]
  advances: DbAdvance[]
  duesCampaigns: DbDuesCampaign[]
  duesItems: DbDuesItem[]
  sessions: DbSession[]
  sessionRegistrations: DbSessionRegistration[]
  attendance: DbAttendance[]
  attendanceSheets: DbAttendanceSheet[]
  attendanceCodes: DbAttendanceCode[]
  auditLogs: DbAuditLog[]
  transferRequests: DbTransferRequest[]
}

export function createSeed(): MockDb {
  const notifications = createNotificationSeed()
  const users = createUserSeed()
  const departments = createDepartmentSeed()
  const memberships = createMembershipSeed()
  const seed: MockDb = {
    users,
    clubs: createClubSeed(),
    terms: createTermSeed(),
    // Không seed phiên bàn giao: test và e2e tự tạo, vì nhiều test cũ dựa vào nhiệm kỳ Đang chạy của c-guitar.
    handovers: [],
    handoverItems: [],
    departments,
    memberships,
    leaveRequests: createLeaveRequestSeed(),
    invitations: createInvitationSeed(),
    positions: createPositionSeed(),
    permissionOverrides: [],
    permissionMatrixMeta: [],
    backlogItems: [],
    tasks: createTaskSeed(),
    attachments: [...createAttachmentSeed(), ...createFinanceAttachmentSeed()],
    events: createEventSeed(),
    subcommittees: createSubcommitteeSeed(),
    eventStaff: createEventStaffSeed(),
    eventCoHosts: createCoHostSeed(),
    registrations: createRegistrationSeed(),
    notifications: notifications.notifications,
    notificationRecipients: notifications.recipients,
    funds: createFundSeed(),
    transactions: createTransactionSeed(),
    advances: createAdvanceSeed(),
    ...createDuesSeed({ memberships, users, departments }),
    sessions: createSessionSeed(),
    sessionRegistrations: [],
    attendance: createAttendanceSeed(),
    attendanceSheets: createAttendanceSheetSeed(),
    attendanceCodes: [],
    auditLogs: [],
    transferRequests: [],
  }
  seed.sessionRegistrations = createSessionRegistrationSeed(seed)
  seed.auditLogs = createAuditSeed(seed)
  return seed
}

export const db: MockDb = createSeed()

/** Đưa dữ liệu mock về trạng thái ban đầu (dùng giữa các test). */
export function resetDb(): void {
  Object.assign(db, createSeed())
}

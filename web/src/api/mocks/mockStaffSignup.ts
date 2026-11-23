import type { PendingStaffSignup, SignupSubcommittee, StaffSignupInfo, StaffSignupRequestStatus } from '@/features/event/model/eventTypes'
import { db } from './db'
import { departmentNameOf, isActiveMember, personRef } from './mockMembers'
import { scheduleConflictsOf } from './mockScheduleConflicts'
import { isEventStaff } from './mockStaffEvents'
import type { DbEvent, DbSubcommittee } from './seed/eventSeed'

/** Yêu cầu vào tiểu ban vượt chỉ tiêu (FR-EVT-06, BR-EVT-07); không xóa, giữ lại để ghi nhận ngoại lệ. */
export interface DbStaffSignupRequest {
  id: string
  eventId: string
  subcommitteeId: string
  userId: string
  note: string
  status: StaffSignupRequestStatus
  createdAt: string
  decidedBy: string | null
  decidedAt: string | null
  reason: string | null
}

/** Thành viên tự đăng ký trước khi sự kiện kết thúc; BTC chưa lập hoặc sự kiện đã xong thì không còn ý nghĩa. */
export const SIGNUP_STATUSES: DbEvent['status'][] = ['APPROVED', 'REGISTRATION_OPEN', 'ONGOING']

export const signupAccepting = (event: DbEvent) => event.staffSignupOpen && SIGNUP_STATUSES.includes(event.status)

export const subcommitteesOf = (eventId: string) => db.subcommittees.filter((subcommittee) => subcommittee.eventId === eventId)

export const headcountOf = (subcommittee: DbSubcommittee) =>
  db.eventStaff.filter((staff) => staff.subcommitteeId === subcommittee.id && staff.leftAt === null).length

export const isFull = (subcommittee: DbSubcommittee) => subcommittee.quota !== null && headcountOf(subcommittee) >= subcommittee.quota

export const pendingRequestOf = (eventId: string, userId: string) =>
  db.staffSignupRequests.find((request) => request.eventId === eventId && request.userId === userId && request.status === 'PENDING')

function toSignupSubcommittee(subcommittee: DbSubcommittee): SignupSubcommittee {
  return {
    id: subcommittee.id,
    name: subcommittee.name,
    description: subcommittee.description,
    quota: subcommittee.quota,
    memberCount: headcountOf(subcommittee),
    full: isFull(subcommittee),
  }
}

const subcommitteeName = (subcommitteeId: string) => db.subcommittees.find((subcommittee) => subcommittee.id === subcommitteeId)?.name ?? ''

export function staffSignupInfo(event: DbEvent, userId: string): StaffSignupInfo {
  const myStaff = db.eventStaff.find((staff) => staff.eventId === event.id && staff.userId === userId && staff.leftAt === null)
  const latest = db.staffSignupRequests.filter((request) => request.eventId === event.id && request.userId === userId).at(-1)
  const open = signupAccepting(event)
  return {
    open,
    subcommittees: subcommitteesOf(event.id).map(toSignupSubcommittee),
    mySubcommitteeName: myStaff ? subcommitteeName(myStaff.subcommitteeId) : null,
    myRequest: latest
      ? { id: latest.id, subcommitteeName: subcommitteeName(latest.subcommitteeId), status: latest.status, note: latest.note, reason: latest.reason, createdAt: latest.createdAt }
      : null,
    canSignUp: open && isActiveMember(userId, event.clubId) && !isEventStaff(userId, event) && !pendingRequestOf(event.id, userId),
    conflicts: scheduleConflictsOf(userId, { startAt: event.startAt, endAt: event.endAt, excludeEventId: event.id }, event.clubId),
  }
}

export function toPendingSignup(request: DbStaffSignupRequest, event: DbEvent): PendingStaffSignup {
  const subcommittee = db.subcommittees.find((candidate) => candidate.id === request.subcommitteeId)
  return {
    id: request.id,
    person: personRef(request.userId),
    departmentName: departmentNameOf(request.userId, event.clubId),
    subcommitteeId: request.subcommitteeId,
    subcommitteeName: subcommittee?.name ?? '',
    quota: subcommittee?.quota ?? null,
    memberCount: subcommittee ? headcountOf(subcommittee) : 0,
    note: request.note,
    createdAt: request.createdAt,
  }
}

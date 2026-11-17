import type {
  AdminTransferRequest,
  BoardActivityCheck,
  MemberTransferRequest,
  PresidencyTransferOverview,
} from '@/features/account/model/presidencyTransferTypes'
import { BOARD_INACTIVE_DAYS } from '@/shared/lib/transferRules'
import { db } from './db'
import { membershipOf, personRef } from './mockMembers'
import { BOARD_ROLES, isPositionEffective } from './mockPermissions'
import { nowIso } from './mockTime'

const DAY_MS = 24 * 60 * 60 * 1000

/** Yêu cầu chuyển quyền Chủ nhiệm (FR-ACC-08); kết quả kiểm lúc gửi được lưu lại để Admin so với lúc xử lý. */
export interface DbTransferRequest {
  id: string
  clubId: string
  requesterId: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  checkAtRequest: BoardActivityCheck
  createdAt: string
  handledBy: string | null
  handledAt: string | null
  newPresidentId: string | null
  decisionNote: string | null
  version: number
}

/** Ban chủ nhiệm không hoạt động khi không còn ai giữ chức, hoặc mọi người giữ chức đều không đăng nhập quá số ngày quy định. */
export function boardCheck(clubId: string): BoardActivityCheck {
  const holders = [...new Set(db.positions.filter((position) => position.clubId === clubId && BOARD_ROLES.includes(position.role) && isPositionEffective(position)).map((position) => position.userId))]
  const logins = holders.map((userId) => db.users.find((user) => user.id === userId)?.lastLoginAt ?? null)
  const threshold = Date.now() - BOARD_INACTIVE_DAYS * DAY_MS
  const known = logins.filter((login): login is string => login !== null).toSorted()
  return {
    boardInactive: logins.every((login) => login === null || Date.parse(login) < threshold),
    inactiveDays: BOARD_INACTIVE_DAYS,
    lastBoardLoginAt: known.at(-1) ?? null,
    checkedAt: nowIso(),
  }
}

export const pendingTransferOf = (clubId: string) => db.transferRequests.find((request) => request.clubId === clubId && request.status === 'PENDING')

/** Thành viên Chính thức gửi được khi ban chủ nhiệm không hoạt động và CLB chưa có yêu cầu chờ. */
export function canRequestTransfer(userId: string, clubId: string): boolean {
  return membershipOf(userId, clubId)?.status === 'ACTIVE' && !pendingTransferOf(clubId) && boardCheck(clubId).boardInactive
}

export function toMemberTransferRequest(request: DbTransferRequest, viewerId: string): MemberTransferRequest {
  const mine = request.requesterId === viewerId
  return {
    id: request.id,
    status: request.status,
    requester: personRef(request.requesterId),
    mine,
    reason: mine ? request.reason : null,
    createdAt: request.createdAt,
    handledAt: request.handledAt,
    decisionNote: mine ? request.decisionNote : null,
    newPresident: request.newPresidentId ? personRef(request.newPresidentId) : null,
    allowedActions: mine && request.status === 'PENDING' ? ['CANCEL'] : [],
    version: request.version,
  }
}

export function transferOverview(clubId: string, viewerId: string): PresidencyTransferOverview {
  const check = boardCheck(clubId)
  const latestMine = db.transferRequests
    .filter((request) => request.clubId === clubId && request.requesterId === viewerId)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const request = pendingTransferOf(clubId) ?? latestMine
  return {
    boardInactive: check.boardInactive,
    inactiveDays: check.inactiveDays,
    request: request ? toMemberTransferRequest(request, viewerId) : null,
    allowedActions: canRequestTransfer(viewerId, clubId) ? ['REQUEST'] : [],
  }
}

export function toAdminTransferRequest(request: DbTransferRequest): AdminTransferRequest {
  const club = db.clubs.find((candidate) => candidate.id === request.clubId)
  const pending = request.status === 'PENDING'
  return {
    id: request.id,
    club: { id: request.clubId, name: club?.name ?? 'CLB', shortName: club?.shortName ?? '' },
    requester: personRef(request.requesterId),
    reason: request.reason,
    status: request.status,
    createdAt: request.createdAt,
    checkAtRequest: request.checkAtRequest,
    checkNow: pending ? boardCheck(request.clubId) : null,
    handledBy: request.handledBy ? personRef(request.handledBy) : null,
    handledAt: request.handledAt,
    newPresident: request.newPresidentId ? personRef(request.newPresidentId) : null,
    decisionNote: request.decisionNote,
    allowedActions: pending ? ['DECIDE'] : [],
    version: request.version,
  }
}

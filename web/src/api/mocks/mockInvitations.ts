import type { Invitation, InvitationClub, InvitationPreview, InvitationStatus } from '@/features/member/model/invitationTypes'
import { db, type DbClub, type DbInvitation } from './db'
import { can } from './mockAccess'
import { membershipOf, myMembershipIn, personRef } from './mockMembers'

/** Thứ tự xét: thu hồi, đã dùng (email chỉ dùng một lần), hết hạn; thu hồi sau khi đã hết hạn vẫn hiện Đã thu hồi. */
export function invitationStatus(invitation: DbInvitation, now = Date.now()): InvitationStatus {
  if (invitation.revokedAt) return 'REVOKED'
  if (invitation.kind === 'EMAIL' && invitation.useCount > 0) return 'USED'
  if (Date.parse(invitation.expiresAt) <= now) return 'EXPIRED'
  return 'ACTIVE'
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Mã khó đoán, đủ dài để không dò được (giống mã điểm danh). */
export function newInvitationToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function toInvitation(invitation: DbInvitation, viewerId: string): Invitation {
  const status = invitationStatus(invitation)
  return {
    id: invitation.id,
    kind: invitation.kind,
    token: invitation.token,
    email: invitation.email,
    status,
    createdBy: personRef(invitation.createdBy),
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    revokedAt: invitation.revokedAt,
    revokedBy: invitation.revokedBy ? personRef(invitation.revokedBy) : null,
    useCount: invitation.useCount,
    allowedActions: status === 'ACTIVE' && can(viewerId, invitation.clubId, 'MANAGE_MEMBERS') ? ['REVOKE'] : [],
    version: invitation.version,
  }
}

/** Thông tin công khai của CLB (SRS 3.5), dùng chung cho danh bạ và trang lời mời; không có nội quy, số thành viên. */
export function publicClubInfo(club: DbClub): InvitationClub {
  return {
    id: club.id,
    name: club.name,
    shortName: club.shortName,
    field: club.field,
    description: club.description,
    logoUrl: club.logoUrl,
    contactEmail: club.contactEmail,
    contactPhone: club.contactPhone,
    contactUrl: club.contactUrl,
    collectsStudentId: club.collectsStudentId,
  }
}

/** Lời mời qua email chỉ dành cho đúng tài khoản có email đó. */
export function invitationIsFor(invitation: DbInvitation, userId: string): boolean {
  if (invitation.kind === 'LINK') return true
  const email = db.users.find((user) => user.id === userId)?.email ?? ''
  return normalizeEmail(email) === invitation.email
}

export function toInvitationPreview(invitation: DbInvitation, club: DbClub, viewerId: string): InvitationPreview {
  const status = invitationStatus(invitation)
  return {
    token: invitation.token,
    kind: invitation.kind,
    status,
    club: publicClubInfo(club),
    invitedBy: personRef(invitation.createdBy),
    expiresAt: invitation.expiresAt,
    myMembership: myMembershipIn(viewerId, club.id),
    // BR-MEM-01: còn tư cách đang hoạt động (kể cả Chờ duyệt) thì không gửi thêm yêu cầu.
    allowedActions: status === 'ACTIVE' && !membershipOf(viewerId, club.id) ? ['REQUEST_TO_JOIN'] : [],
  }
}

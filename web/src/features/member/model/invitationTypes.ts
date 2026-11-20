import type { PersonRef } from '@/api/commonTypes'
import type { ClubDirectoryEntry, MyClubMembership } from '@/features/club/model/clubTypes'

/** FR-MEM-01: liên kết dùng nhiều lần tới khi hết hạn; lời mời qua email dùng một lần, đúng tài khoản có email đó. */
export type InvitationKind = 'LINK' | 'EMAIL'

/** Suy ra ở máy chủ: Đã thu hồi, Đã dùng (email), Hết hạn, còn lại là Còn hiệu lực. */
export type InvitationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'USED'

export interface Invitation {
  id: string
  kind: InvitationKind
  /** Chỉ người quản lý lời mời nhận; trang web ghép thành `/invite/{token}`. */
  token: string
  email: string | null
  status: InvitationStatus
  createdBy: PersonRef
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  revokedBy: PersonRef | null
  useCount: number
  allowedActions: Array<'REVOKE'>
  version: number
}

export interface InvitationQuery {
  status?: InvitationStatus
  page?: number
  size?: number
}

export interface CreateInvitationRequest {
  kind: InvitationKind
  email?: string
}

/** Thông tin công khai của CLB như ở danh bạ (SRS 3.5). */
export type InvitationClub = Omit<ClubDirectoryEntry, 'myMembership' | 'allowedActions'>

/** Người mở liên kết mời thấy gì; `REQUEST_TO_JOIN` chỉ có khi lời mời còn hiệu lực và người xem chưa có tư cách đang hoạt động. */
export interface InvitationPreview {
  token: string
  kind: InvitationKind
  status: InvitationStatus
  club: InvitationClub
  invitedBy: PersonRef
  expiresAt: string
  myMembership: MyClubMembership | null
  allowedActions: Array<'REQUEST_TO_JOIN'>
}

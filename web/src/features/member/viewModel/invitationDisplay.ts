import { formatDateTime } from '@/shared/format/formatDate'
import { formatNumber } from '@/shared/format/formatMoney'
import type { Tone } from '@/shared/ui/tone'
import type { Invitation, InvitationPreview, InvitationStatus } from '../model/invitationTypes'

export const invitationStatusDisplay: Record<InvitationStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Còn hiệu lực', tone: 'success' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
  REVOKED: { label: 'Đã thu hồi', tone: 'danger' },
  USED: { label: 'Đã dùng', tone: 'info' },
}

/** Chip lọc danh sách lời mời; chuỗi rỗng là tất cả. */
export const INVITATION_FILTERS: Array<{ value: InvitationStatus | ''; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Còn hiệu lực' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'REVOKED', label: 'Đã thu hồi' },
  { value: 'USED', label: 'Đã dùng' },
]

/** Đường dẫn đầy đủ để gửi cho người được mời. */
export function invitationUrl(token: string, origin: string = window.location.origin): string {
  return `${origin}/invite/${encodeURIComponent(token)}`
}

export const invitationTitle = (invitation: Pick<Invitation, 'kind' | 'email'>) => (invitation.kind === 'EMAIL' ? (invitation.email ?? 'Lời mời qua email') : 'Liên kết mời')

/** Một dòng nêu hạn hoặc lý do lời mời không còn dùng được. */
export function invitationStateLine(invitation: Pick<Invitation, 'status' | 'expiresAt' | 'revokedAt' | 'revokedBy'>): string {
  switch (invitation.status) {
    case 'ACTIVE':
      return `Còn hiệu lực đến ${formatDateTime(invitation.expiresAt)}`
    case 'EXPIRED':
      return `Hết hạn lúc ${formatDateTime(invitation.expiresAt)}`
    case 'REVOKED':
      return invitation.revokedAt ? `Thu hồi lúc ${formatDateTime(invitation.revokedAt)}${invitation.revokedBy ? ` bởi ${invitation.revokedBy.fullName}` : ''}` : 'Đã thu hồi'
    case 'USED':
      return 'Người được mời đã dùng để gửi yêu cầu gia nhập'
  }
}

export function useCountLabel(invitation: Pick<Invitation, 'kind' | 'useCount'>): string | null {
  if (invitation.kind === 'EMAIL') return null
  return invitation.useCount === 0 ? 'Chưa ai dùng' : `${formatNumber(invitation.useCount)} lượt gửi yêu cầu`
}

/** Trang lời mời hiện gì: nút gửi yêu cầu, hoặc lý do không gửi được. */
export type InvitationPageState = 'JOIN' | 'PENDING' | 'MEMBER' | 'EXPIRED' | 'REVOKED' | 'USED'

export function invitationPageState(preview: Pick<InvitationPreview, 'status' | 'myMembership' | 'allowedActions'>): InvitationPageState {
  const status = preview.myMembership?.status
  if (status === 'PENDING') return 'PENDING'
  if (status === 'PROBATION' || status === 'ACTIVE' || status === 'ON_LEAVE') return 'MEMBER'
  if (preview.allowedActions.includes('REQUEST_TO_JOIN')) return 'JOIN'
  if (preview.status === 'REVOKED' || preview.status === 'USED') return preview.status
  return 'EXPIRED'
}

export const invitationPageMessage: Record<Exclude<InvitationPageState, 'JOIN'>, { title: string; description: string }> = {
  PENDING: { title: 'Yêu cầu của bạn đang chờ duyệt', description: 'Ban chủ nhiệm sẽ xem lời giới thiệu và báo kết quả cho bạn.' },
  MEMBER: { title: 'Bạn đã là thành viên CLB này', description: 'Không cần gửi yêu cầu nữa.' },
  EXPIRED: { title: 'Lời mời đã hết hạn', description: 'Xin người mời gửi liên kết mới, hoặc tìm CLB ở mục Tìm CLB để gửi yêu cầu.' },
  REVOKED: { title: 'Lời mời đã bị thu hồi', description: 'Ban chủ nhiệm đã thu hồi liên kết này. Bạn vẫn có thể tìm CLB ở mục Tìm CLB để gửi yêu cầu.' },
  USED: { title: 'Lời mời đã được dùng', description: 'Lời mời qua email chỉ dùng được một lần.' },
}

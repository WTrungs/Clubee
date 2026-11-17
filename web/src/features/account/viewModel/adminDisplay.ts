import { formatDateTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { AccountStatus, AdminAccount } from '../model/adminTypes'

export { ADMIN_EMAIL_QUERY_MIN } from '@/shared/lib/accountRules'

export const accountStatusDisplay: Record<AccountStatus, { label: string; tone: Tone }> = {
  PENDING_VERIFICATION: { label: 'Chờ xác thực', tone: 'warning' },
  ACTIVE: { label: 'Hoạt động', tone: 'success' },
  LOCKED: { label: 'Bị khóa', tone: 'danger' },
}

export function lastLoginText(lastLoginAt: string | null): string {
  return lastLoginAt ? `Đăng nhập lần cuối ${formatDateTime(lastLoginAt)}` : 'Chưa đăng nhập lần nào'
}

export function lockLine(account: Pick<AdminAccount, 'status' | 'lockReason' | 'lockedAt'>): string | null {
  if (account.status !== 'LOCKED' || !account.lockReason) return null
  return account.lockedAt ? `Khóa lúc ${formatDateTime(account.lockedAt)}: ${account.lockReason}` : `Lý do khóa: ${account.lockReason}`
}

export const clubCountText = (count: number) => (count === 0 ? 'Chưa tham gia CLB nào' : `Đang tham gia ${count} CLB`)

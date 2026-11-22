import type { PasswordResetLink, PasswordResetLinkStatus } from '@/features/account/model/accountTypes'
import { PASSWORD_RESET_MINUTES } from '@/shared/lib/accountRules'
import { db, type DbUser } from './db'
import { nowIso, toVnIso } from './mockTime'

/** Liên kết đặt lại mật khẩu (FR-ACC-03); máy chủ thật chỉ lưu bản băm của token. */
export interface DbPasswordReset {
  token: string
  userId: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
  /** Mất hiệu lực vì đã có liên kết mới hơn hoặc mật khẩu đã được đặt lại bằng liên kết khác. */
  revokedAt: string | null
}

const MINUTE_MS = 60_000

const isOpen = (reset: DbPasswordReset) => reset.usedAt === null && reset.revokedAt === null

export function resetLinkStatus(reset: DbPasswordReset): PasswordResetLinkStatus {
  if (!isOpen(reset)) return 'USED'
  return Date.parse(reset.expiresAt) <= Date.now() ? 'EXPIRED' : 'VALID'
}

/** FR-ACC-03, FR-ACC-09: tạo liên kết mới hết hạn sau 30 phút; liên kết chưa dùng trước đó của người này mất hiệu lực. */
export function issueResetLink(user: DbUser): DbPasswordReset {
  const now = nowIso()
  for (const reset of db.passwordResets) if (reset.userId === user.id && isOpen(reset)) reset.revokedAt = now
  const reset: DbPasswordReset = {
    token: crypto.randomUUID().replaceAll('-', ''),
    userId: user.id,
    createdAt: now,
    expiresAt: toVnIso(Date.now() + PASSWORD_RESET_MINUTES * MINUTE_MS),
    usedAt: null,
    revokedAt: null,
  }
  db.passwordResets.push(reset)
  return reset
}

export const findResetLink = (token: string) => db.passwordResets.find((reset) => reset.token === token)

/** Che phần tên của email, ví dụ `anh.nguyen@demo.test` thành `an***@demo.test`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

export function toResetLink(reset: DbPasswordReset, user: DbUser): PasswordResetLink {
  return { status: resetLinkStatus(reset), emailHint: maskEmail(user.email), expiresAt: reset.expiresAt }
}

/** Đặt mật khẩu mới: liên kết thành đã dùng, các liên kết còn mở khác của người này mất hiệu lực. */
export function completeReset(reset: DbPasswordReset, user: DbUser, newPassword: string): void {
  const now = nowIso()
  reset.usedAt = now
  for (const other of db.passwordResets) if (other !== reset && other.userId === user.id && isOpen(other)) other.revokedAt = now
  user.password = newPassword
}

export const resetPasswordPath = (token: string) => `/reset-password?token=${encodeURIComponent(token)}`

/** Hộp thư demo của chế độ mock: liên kết còn dùng được mới nhất đã gửi tới email này, null khi không có thư nào. */
export function latestResetLinkFor(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  const user = db.users.find((candidate) => candidate.email.toLowerCase() === normalized)
  const reset = user ? db.passwordResets.findLast((candidate) => candidate.userId === user.id && resetLinkStatus(candidate) === 'VALID') : undefined
  return reset ? resetPasswordPath(reset.token) : null
}

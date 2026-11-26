import type { AccountType } from '../model/accountTypes'

export const DEFAULT_AFTER_LOGIN = '/clubs'
export const ADMIN_HOME = '/admin'

/** Trang Admin cũng mở được (SRS 3.4); các trang còn lại thuộc người dùng CLB. */
const ADMIN_PATHS = ['/admin', '/me/profile', '/me/notification-settings', '/notifications']
const isAdminPath = (path: string) => ADMIN_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))

export const homeOf = (accountType: AccountType) => (accountType === 'ADMIN' ? ADMIN_HOME : DEFAULT_AFTER_LOGIN)

/** Chỉ quay lại đường dẫn nội bộ hợp với loại tài khoản, chặn chuyển hướng ra trang ngoài. */
export function resolveRedirect(state: unknown, accountType: AccountType = 'USER'): string {
  const home = homeOf(accountType)
  if (typeof state !== 'object' || state === null || !('from' in state)) return home
  const from = (state as { from: unknown }).from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return home
  if (from === '/login' || from === '/register') return home
  // Phiên trước là Admin mà người đăng nhập sau là thành viên (hoặc ngược lại) thì về trang đầu của mình.
  if (accountType === 'ADMIN' && !isAdminPath(from)) return home
  if (accountType === 'USER' && (from === ADMIN_HOME || from.startsWith(`${ADMIN_HOME}/`))) return home
  return from
}

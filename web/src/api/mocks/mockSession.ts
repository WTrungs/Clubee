import { readCookie } from '@/shared/lib/cookies'

/** Mô phỏng phiên cookie của Spring Session; cookie chỉ chứa mã người dùng mock, không phải bí mật. */
const SESSION_COOKIE = 'mockSession'
const CSRF_COOKIE = 'XSRF-TOKEN'

let memoryUserId: string | null = null

function writeCookie(name: string, value: string | null): void {
  if (typeof document === 'undefined') return
  document.cookie = value === null ? `${name}=; path=/; max-age=0; SameSite=Lax` : `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`
}

export function getSessionUserId(): string | null {
  return readCookie(SESSION_COOKIE) ?? memoryUserId
}

export function startSession(userId: string): void {
  memoryUserId = userId
  writeCookie(SESSION_COOKIE, userId)
  writeCookie(CSRF_COOKIE, crypto.randomUUID())
}

export function endSession(): void {
  memoryUserId = null
  writeCookie(SESSION_COOKIE, null)
  writeCookie(CSRF_COOKIE, null)
}

/** Giống CsrfFilter: request ghi phải gửi lại token trong header X-XSRF-TOKEN. */
export function hasValidCsrf(request: Request): boolean {
  const expected = readCookie(CSRF_COOKIE)
  if (!expected) return true
  return request.headers.get('X-XSRF-TOKEN') === expected
}

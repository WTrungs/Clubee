import { delay, HttpResponse } from 'msw'
import type { FieldError } from '@/api/apiError'
import type { Page } from '@/api/pagination'
import { db, type DbUser } from './db'
import { runDueJobs } from './mockSchedule'
import { getSessionUserId, hasValidCsrf } from './mockSession'

export const API = '*/api/v1'

export function problem(status: number, detail: string, code?: string, errors?: FieldError[]) {
  return HttpResponse.json(
    { type: 'about:blank', title: detail, status, detail, code, errors },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

export type Guarded<T> = { ok: true; value: T } | { ok: false; response: Response }

/** Độ trễ giống mạng thật để thấy skeleton; trong Node (test) MSW gần như trả ngay. */
export const networkDelay = () => delay()

export function currentUser(): Guarded<DbUser> {
  const userId = getSessionUserId()
  const user = userId ? db.users.find((candidate) => candidate.id === userId) : undefined
  if (!user) return { ok: false, response: problem(401, 'Bạn cần đăng nhập để tiếp tục.', 'UNAUTHENTICATED') }
  // Khóa tài khoản là thu hồi luôn phiên đang mở (FR-ACC-09).
  if (user.status === 'LOCKED') return { ok: false, response: problem(401, 'Tài khoản đã bị khóa nên phiên đăng nhập kết thúc.', 'ACCOUNT_LOCKED') }
  runDueJobs()
  return { ok: true, value: user }
}

/** Trả tệp kèm tên gốc (UTF-8); không lưu đệm vì quyền xem kiểm lại mỗi lần. */
export function downloadResponse(file: Blob, fileName: string, contentType: string): Response {
  const ascii = fileName.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '') || 'tep'
  return new HttpResponse(file, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const csrfRejected = () => problem(403, 'Phiên làm việc không hợp lệ (thiếu token CSRF). Tải lại trang rồi thử lại.', 'CSRF')

/** Kiểm tra đăng nhập và token CSRF cho request ghi. */
export function writer(request: Request): Guarded<DbUser> {
  const user = currentUser()
  if (!user.ok) return user
  if (!hasValidCsrf(request)) return { ok: false, response: csrfRejected() }
  return user
}

export function paginate<T>(items: T[], url: URL, defaultSize = 20): Page<T> {
  const page = Math.max(Number(url.searchParams.get('page') ?? 0), 0)
  const size = Math.min(Math.max(Number(url.searchParams.get('size') ?? defaultSize), 1), 200)
  const totalElements = items.length
  return {
    content: items.slice(page * size, page * size + size),
    page,
    size,
    totalElements,
    totalPages: Math.ceil(totalElements / size),
  }
}

export { matchesKeyword } from '@/shared/lib/searchText'

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

/** Mock giữ ảnh tải lên (ảnh đại diện, logo) dạng data URL trong bộ nhớ; máy chủ thật lưu ở kho S3 (IF-05). */
export async function fileToDataUrl(file: File, contentType: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return `data:${contentType};base64,${btoa(binary)}`
}

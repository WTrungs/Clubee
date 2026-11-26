import { getResponse, http, HttpResponse, type RequestHandler } from 'msw'
import type { ClubStatus, ClubStatusChange } from '@/features/club/model/clubTypes'
import { db, type DbClub } from './db'
import { API, currentUser, problem, writer } from './mockHttp'
import { canAccessClub, personRef } from './mockMembers'

export const clubStatusOf = (clubId: string): ClubStatus | null => db.clubs.find((club) => club.id === clubId)?.status ?? null
export const isClubDissolved = (clubId: string) => clubStatusOf(clubId) === 'DISSOLVED'
/** ST-CLB: chỉ CLB Hoạt động mới tạo buổi sinh hoạt, sự kiện, đợt tuyển mới. */
export const acceptsNewActivities = (clubId: string) => clubStatusOf(clubId) === 'ACTIVE'

export const dissolvedProblem = () => problem(422, 'CLB đã giải thể nên chỉ xem được, không thay đổi được dữ liệu.', 'CLUB_DISSOLVED')

/** 422 khi CLB không còn Hoạt động mà người dùng tạo hoạt động mới. */
export function newActivityBlocked(clubId: string): Response | null {
  const status = clubStatusOf(clubId)
  if (status === 'SUSPENDED') return problem(422, 'CLB đang tạm ngừng nên không tạo được hoạt động mới.', 'CLUB_SUSPENDED')
  if (status === 'DISSOLVED') return dissolvedProblem()
  return null
}

export function lastStatusChangeOf(club: DbClub): ClubStatusChange | null {
  const change = club.statusHistory.at(-1)
  return change ? { status: change.to, at: change.at, by: personRef(change.by), reason: change.reason } : null
}

const readOnlyAction = (action: unknown) => typeof action === 'string' && action.startsWith('VIEW_')

/** Bỏ mọi hành động ghi trong `allowedActions` ở mọi tầng của phản hồi. */
export function stripWriteActions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripWriteActions)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, key === 'allowedActions' && Array.isArray(item) ? item.filter(readOnlyAction) : stripWriteActions(item)]),
  )
}

/** CLB đã giải thể chỉ đọc: chặn mọi lệnh ghi của thành viên, bỏ hành động ghi khỏi phản hồi đọc. Người ngoài đi tiếp để nhận 403 đúng thứ tự. */
export function clubStatusGuards(routes: RequestHandler[]) {
  const guard = async ({ request, params }: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => {
    const clubId = String(params.clubId)
    if (!isClubDissolved(clubId)) return undefined
    const user = request.method === 'GET' ? currentUser() : writer(request)
    if (!user.ok || !canAccessClub(user.value.id, clubId)) return undefined
    if (request.method !== 'GET') return dissolvedProblem()
    const response = await getResponse(routes, request)
    if (!response?.ok || !response.headers.get('Content-Type')?.includes('application/json')) return response
    return HttpResponse.json(stripWriteActions(await response.json()) as Record<string, unknown>, { status: response.status })
  }
  return [http.all(`${API}/clubs/:clubId`, guard), http.all(`${API}/clubs/:clubId/*`, guard)]
}

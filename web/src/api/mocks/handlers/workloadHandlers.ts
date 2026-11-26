import { http, HttpResponse } from 'msw'
import type { WorkloadScopeType } from '@/features/task/model/taskTypes'
import { db } from '../db'
import { API, currentUser, networkDelay, problem } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import { workloadOf, workloadScopesOf } from '../mockWorkload'

// FR-TASK-08: khối lượng việc theo người, trong phạm vi người gọi quản lý.

const SCOPE_TYPES: WorkloadScopeType[] = ['CLUB', 'DEPARTMENT', 'EVENT']
const noScope = () => problem(403, 'Chỉ ban chủ nhiệm, Trưởng ban, Phó ban và Trưởng BTC xem được khối lượng việc theo người.', 'FORBIDDEN')

/** Phạm vi có thật trong CLB hay không, để phân biệt 404 với 403. */
function scopeExists(clubId: string, type: WorkloadScopeType, id: string | null): boolean {
  if (type === 'CLUB') return true
  if (type === 'DEPARTMENT') return db.departments.some((department) => department.id === id && department.clubId === clubId)
  return db.events.some((event) => event.id === id && event.clubId === clubId)
}

export const workloadHandlers = [
  http.get(`${API}/clubs/:clubId/workload-scopes`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    return HttpResponse.json(workloadScopesOf(user.value.id, clubId))
  }),

  http.get(`${API}/clubs/:clubId/workload`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
    const scopes = workloadScopesOf(user.value.id, clubId)
    if (scopes.length === 0) return noScope()
    const url = new URL(request.url)
    const type = url.searchParams.get('scopeType') as WorkloadScopeType | null
    const id = type === 'CLUB' ? null : url.searchParams.get('scopeId')
    if (!type || !SCOPE_TYPES.includes(type) || (type !== 'CLUB' && !id)) {
      return problem(400, 'Chọn phạm vi cần xem.', 'VALIDATION', [{ field: 'scopeType', message: 'Phạm vi là CLUB, hoặc DEPARTMENT, EVENT kèm scopeId.' }])
    }
    if (!scopeExists(clubId, type, id)) return problem(404, 'Không tìm thấy ban hoặc sự kiện này.', 'SCOPE_NOT_FOUND')
    const scope = scopes.find((candidate) => candidate.type === type && candidate.id === id)
    if (!scope) return problem(403, 'Bạn không quản lý phạm vi này nên không xem được khối lượng việc của nó.', 'FORBIDDEN')
    return HttpResponse.json(workloadOf(clubId, scope))
  }),
]

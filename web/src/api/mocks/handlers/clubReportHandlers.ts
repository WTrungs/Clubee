import { http, HttpResponse } from 'msw'
import { db, type DbClub } from '../db'
import { canViewClubReport, clubReport, departmentReport, leadsDepartment, reportDepartmentsOf } from '../mockClubReport'
import { API, currentUser, networkDelay, problem } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import { reportPeriods, resolveReportRange } from '../mockReportPeriods'

// FR-RPT-03 (phần ban), FR-RPT-04: báo cáo CLB và báo cáo ban theo kỳ dùng chung với báo cáo thu chi.

/** CLB tồn tại và người dùng còn là thành viên; trả CLB hoặc lỗi 404, 403. */
function clubOf(userId: string, clubId: string): { ok: true; club: DbClub } | { ok: false; response: Response } {
  const club = db.clubs.find((candidate) => candidate.id === clubId)
  if (!club) return { ok: false, response: problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND') }
  if (!canAccessClub(userId, clubId)) return { ok: false, response: problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER') }
  return { ok: true, club }
}

const canViewAnyReport = (userId: string, clubId: string) => canViewClubReport(userId, clubId) || reportDepartmentsOf(userId, clubId).length > 0

export const clubReportHandlers = [
  http.get(`${API}/clubs/:clubId/report-periods`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = clubOf(user.value.id, String(params.clubId))
    if (!target.ok) return target.response
    if (!canViewAnyReport(user.value.id, target.club.id)) return problem(403, 'Chỉ ban chủ nhiệm, trưởng ban và phó ban xem được báo cáo.', 'FORBIDDEN')
    return HttpResponse.json(reportPeriods(target.club))
  }),

  http.get(`${API}/clubs/:clubId/report-departments`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = clubOf(user.value.id, String(params.clubId))
    if (!target.ok) return target.response
    return HttpResponse.json(reportDepartmentsOf(user.value.id, target.club.id))
  }),

  http.get(`${API}/clubs/:clubId/club-report`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = clubOf(user.value.id, String(params.clubId))
    if (!target.ok) return target.response
    if (!canViewClubReport(user.value.id, target.club.id)) return problem(403, 'Báo cáo CLB chỉ ban chủ nhiệm xem được.', 'FORBIDDEN')
    const resolved = resolveReportRange(new URL(request.url), target.club)
    if (!resolved.ok) return problem(400, 'Kỳ chưa hợp lệ.', 'VALIDATION', resolved.errors)
    return HttpResponse.json(clubReport(target.club, resolved.range))
  }),

  http.get(`${API}/clubs/:clubId/departments/:departmentId/report`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = clubOf(user.value.id, String(params.clubId))
    if (!target.ok) return target.response
    const department = db.departments.find((candidate) => candidate.id === params.departmentId && candidate.clubId === target.club.id)
    if (!department) return problem(404, 'Không tìm thấy ban.', 'DEPARTMENT_NOT_FOUND')
    if (!canViewClubReport(user.value.id, target.club.id) && !leadsDepartment(user.value.id, department)) {
      return problem(403, 'Báo cáo ban chỉ ban chủ nhiệm, trưởng và phó của ban đó xem được.', 'FORBIDDEN')
    }
    const resolved = resolveReportRange(new URL(request.url), target.club)
    if (!resolved.ok) return problem(400, 'Kỳ chưa hợp lệ.', 'VALIDATION', resolved.errors)
    return HttpResponse.json(departmentReport(target.club, department, resolved.range))
  }),
]

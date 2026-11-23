import { http, HttpResponse } from 'msw'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type FinanceCategory } from '@/features/finance/model/financeTypes'
import { db } from '../db'
import { canReachClubFinance } from '../mockFinance'
import { buildFinanceReport, clubEventWithFund, unpaidDuesOf } from '../mockFinanceReport'
import { reportPeriods, resolveReportRange } from '../mockReportPeriods'
import { API, currentUser, networkDelay, paginate, problem } from '../mockHttp'
import { isBoardMember } from '../mockPermissions'

// FR-FIN-12: báo cáo thu chi chỉ ban chủ nhiệm xem (SRS 3.5). Bộ lọc hạng mục, sự kiện dùng kèm kỳ.

/** Hạng mục lọc được; chuyển quỹ không nằm trong báo cáo nên không lọc theo `FUND_TRANSFER`. */
const REPORT_CATEGORIES: FinanceCategory[] = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, 'CO_HOST_SHARE']
type FieldError = { field: string; message: string }

function gate(userId: string, clubId: string): Response | null {
  if (!db.clubs.some((club) => club.id === clubId)) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  if (!canReachClubFinance(userId, clubId)) return problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
  if (!isBoardMember(userId, clubId)) return problem(403, 'Báo cáo thu chi chỉ ban chủ nhiệm xem được.', 'FORBIDDEN')
  return null
}

export const financeReportHandlers = [
  http.get(`${API}/clubs/:clubId/finance-report/periods`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = gate(user.value.id, clubId)
    if (denied) return denied
    const club = db.clubs.find((candidate) => candidate.id === clubId)
    return club ? HttpResponse.json(reportPeriods(club)) : problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
  }),

  http.get(`${API}/clubs/:clubId/finance-report`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = gate(user.value.id, clubId)
    if (denied) return denied
    const club = db.clubs.find((candidate) => candidate.id === clubId)
    if (!club) return problem(404, 'Không tìm thấy CLB.', 'CLUB_NOT_FOUND')
    const url = new URL(request.url)
    const resolved = resolveReportRange(url, club)
    const errors: FieldError[] = resolved.ok ? [] : [...resolved.errors]
    const range = resolved.ok ? resolved.range : null
    const category = url.searchParams.get('category')
    if (category && !REPORT_CATEGORIES.includes(category as FinanceCategory)) errors.push({ field: 'category', message: 'Hạng mục không có trong danh mục.' })
    const eventId = url.searchParams.get('eventId')
    if (eventId && !clubEventWithFund(clubId, eventId)) errors.push({ field: 'eventId', message: 'Sự kiện không thuộc CLB hoặc chưa có quỹ.' })
    if (errors.length > 0 || !range) return problem(400, 'Điều kiện báo cáo chưa hợp lệ.', 'VALIDATION', errors)
    return HttpResponse.json(buildFinanceReport(club, range, { category: (category as FinanceCategory | null) || null, eventId: eventId || null }))
  }),

  http.get(`${API}/clubs/:clubId/finance-report/unpaid-dues`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    const denied = gate(user.value.id, clubId)
    if (denied) return denied
    const url = new URL(request.url)
    const campaignId = url.searchParams.get('campaignId')
    if (campaignId && !db.duesCampaigns.some((campaign) => campaign.id === campaignId && campaign.clubId === clubId)) {
      return problem(400, 'Đợt đóng quỹ không thuộc CLB.', 'VALIDATION', [{ field: 'campaignId', message: 'Đợt đóng quỹ không thuộc CLB.' }])
    }
    return HttpResponse.json(paginate(unpaidDuesOf(clubId, campaignId ?? undefined), url, 20))
  }),
]

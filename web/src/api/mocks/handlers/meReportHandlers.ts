import { http, HttpResponse } from 'msw'
import type { ClubHistoryEntry, MyAttendanceRow, MyDuesRow } from '@/features/report/model/myReportTypes'
import { db, type DbClub } from '../db'
import { attendanceRecordsOf, tallyAttendance } from '../mockAttendanceStats'
import { duesItemStatus, paidOf } from '../mockDues'
import { API, currentUser, networkDelay, paginate, problem } from '../mockHttp'
import { reportPeriods, resolveReportRange } from '../mockReportPeriods'
import { taskTallyOf } from '../mockTaskStats'

// FR-ATT-10, FR-RPT-02: lịch sử tham gia và báo cáo cá nhân; mỗi người chỉ xem dữ liệu của chính mình, kể cả ở CLB đã rời.

/** Đã từng là thành viên (có ngày gia nhập), kể cả đã rời; người chỉ mới gửi yêu cầu thì chưa có gì để xem. */
const everJoined = (userId: string, clubId: string) =>
  db.memberships.some((membership) => membership.userId === userId && membership.clubId === clubId && membership.joinedOn !== null)

function clubFor(userId: string, url: URL): { ok: true; club: DbClub } | { ok: false; response: Response } {
  const clubId = url.searchParams.get('clubId') ?? ''
  const club = db.clubs.find((candidate) => candidate.id === clubId)
  if (!club || !everJoined(userId, clubId)) return { ok: false, response: problem(403, 'Bạn chưa từng là thành viên của CLB này.', 'NOT_A_MEMBER') }
  return { ok: true, club }
}

export const meReportHandlers = [
  http.get(`${API}/me/club-history`, async () => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const userId = user.value.id
    // Một CLB có thể có nhiều lần tham gia (rời rồi gia nhập lại): lấy lần gần nhất đã gia nhập.
    const latest = new Map<string, (typeof db.memberships)[number]>()
    for (const membership of db.memberships.filter((candidate) => candidate.userId === userId && candidate.joinedOn !== null)) {
      const current = latest.get(membership.clubId)
      if (!current || (membership.joinedOn ?? '') > (current.joinedOn ?? '')) latest.set(membership.clubId, membership)
    }
    const rows: ClubHistoryEntry[] = [...latest.values()].map((membership) => ({
      clubId: membership.clubId,
      clubName: db.clubs.find((club) => club.id === membership.clubId)?.name ?? 'CLB',
      status: membership.status,
      departmentName: db.departments.find((department) => department.id === membership.departmentId)?.name ?? null,
      joinedOn: membership.joinedOn,
      leftOn: membership.leftOn,
    }))
    // CLB đang tham gia trước, đã rời sau; cùng nhóm thì theo tên.
    return HttpResponse.json(rows.toSorted((a, b) => Number(a.status === 'LEFT') - Number(b.status === 'LEFT') || a.clubName.localeCompare(b.clubName, 'vi')))
  }),

  http.get(`${API}/me/report-periods`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const target = clubFor(user.value.id, new URL(request.url))
    if (!target.ok) return target.response
    return HttpResponse.json(reportPeriods(target.club))
  }),

  http.get(`${API}/me/attendance`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const url = new URL(request.url)
    const target = clubFor(user.value.id, url)
    if (!target.ok) return target.response
    const resolved = resolveReportRange(url, target.club)
    if (!resolved.ok) return problem(400, 'Kỳ chưa hợp lệ.', 'VALIDATION', resolved.errors)
    const records = attendanceRecordsOf(user.value.id, target.club.id, resolved.range.from, resolved.range.to)
    const rows: MyAttendanceRow[] = records.map(({ record, date, title }) => ({
      id: record.id,
      activity: { type: record.activityType, id: record.activityId, title },
      date,
      status: record.status,
      method: record.method,
      edited: record.changes.length > 0,
    }))
    return HttpResponse.json({ ...paginate(rows, url, 20), range: resolved.range, tally: tallyAttendance(records.map(({ record }) => record.status)) })
  }),

  http.get(`${API}/me/report`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const userId = user.value.id
    const url = new URL(request.url)
    const target = clubFor(userId, url)
    if (!target.ok) return target.response
    const resolved = resolveReportRange(url, target.club)
    if (!resolved.ok) return problem(400, 'Kỳ chưa hợp lệ.', 'VALIDATION', resolved.errors)
    const { range } = resolved
    const club = target.club
    const records = attendanceRecordsOf(userId, club.id, range.from, range.to)
    const dues: MyDuesRow[] = db.duesCampaigns
      .filter((campaign) => campaign.clubId === club.id && campaign.dueOn >= range.from && campaign.dueOn <= range.to)
      .flatMap((campaign) =>
        db.duesItems
          .filter((item) => item.campaignId === campaign.id && item.userId === userId)
          .map((item) => ({ campaignId: campaign.id, name: campaign.name, dueOn: campaign.dueOn, amountDue: item.amountDue, paid: paidOf(item), status: duesItemStatus(item) })),
      )
      .toSorted((a, b) => b.dueOn.localeCompare(a.dueOn))
    return HttpResponse.json({
      club: { id: club.id, name: club.name },
      range,
      attendance: tallyAttendance(records.map(({ record }) => record.status)),
      tasks: taskTallyOf(
        db.tasks.filter((task) => task.clubId === club.id),
        userId,
        range,
      ),
      dues,
    })
  }),
]

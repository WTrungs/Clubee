import { http, HttpResponse } from 'msw'
import type { RecruitmentRequest, UpdateRecruitmentRequest } from '@/features/recruitment/model/recruitmentTypes'
import { db, type DbRecruitment } from '../db'
import { forbidden } from '../mockAccess'
import { API, currentUser, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import { canAccessClub } from '../mockMembers'
import {
  canManageRecruitment,
  changesStructure,
  judgeCandidates,
  parseRecruitment,
  recruitmentStatusOf,
  structureLocked,
  toRecruitmentDetail,
  toRecruitmentSummary,
} from '../mockRecruitments'
import { nowIso } from '../mockTime'

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const findRecruitment = (clubId: string, id: unknown) => db.recruitments.find((recruitment) => recruitment.id === id && recruitment.clubId === clubId)

export const recruitmentHandlers = [
  http.get(`${API}/clubs/:clubId/recruitments`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!canManageRecruitment(user.value.id, clubId)) return forbidden(clubId, 'MANAGE_MEMBERS', 'xem đợt tuyển')
    // Đợt đang diễn ra trước, rồi theo giờ mở mới nhất.
    const rows = db.recruitments
      .filter((recruitment) => recruitment.clubId === clubId)
      .toSorted((a, b) => Number(recruitmentStatusOf(a) === 'CLOSED') - Number(recruitmentStatusOf(b) === 'CLOSED') || b.opensAt.localeCompare(a.opensAt))
      .map(toRecruitmentSummary)
    return HttpResponse.json(paginate(rows, new URL(request.url), 20))
  }),

  http.post(`${API}/clubs/:clubId/recruitments`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!canManageRecruitment(user.value.id, clubId)) return forbidden(clubId, 'MANAGE_MEMBERS', 'mở đợt tuyển')
    const body = (await request.json()) as Partial<RecruitmentRequest>
    const { value, errors } = parseRecruitment(clubId, body)
    if (errors.length > 0) return problem(400, 'Thông tin đợt tuyển chưa hợp lệ.', 'VALIDATION', errors)
    const recruitment: DbRecruitment = { id: newId('rec'), clubId, ...value, createdBy: user.value.id, createdAt: nowIso(), finalizedAt: null, closedAt: null, version: 1 }
    db.recruitments.push(recruitment)
    return HttpResponse.json(toRecruitmentDetail(recruitment, user.value.id), { status: 201 })
  }),

  http.get(`${API}/clubs/:clubId/recruitments/:recruitmentId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!canManageRecruitment(user.value.id, clubId)) return forbidden(clubId, 'MANAGE_MEMBERS', 'xem đợt tuyển')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    return HttpResponse.json(toRecruitmentDetail(recruitment, user.value.id))
  }),

  http.patch(`${API}/clubs/:clubId/recruitments/:recruitmentId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!canManageRecruitment(user.value.id, clubId)) return forbidden(clubId, 'MANAGE_MEMBERS', 'sửa đợt tuyển')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    const body = (await request.json()) as Partial<UpdateRecruitmentRequest>
    if (body.version !== recruitment.version) return problem(409, 'Đợt tuyển vừa được người khác cập nhật. Tải lại để xem thông tin mới nhất.', 'VERSION_CONFLICT')
    const status = recruitmentStatusOf(recruitment)
    if (status === 'RESULTS' || status === 'CLOSED') return problem(422, 'Đợt tuyển đã chốt kết quả nên không sửa được nữa.', 'RECRUITMENT_FINALIZED')
    if (structureLocked(recruitment) && changesStructure(recruitment, body)) {
      return problem(422, 'Đợt tuyển đã mở nên không đổi được giờ mở, các vòng và câu hỏi.', 'RECRUITMENT_STARTED')
    }
    const merged: Partial<RecruitmentRequest> = {
      name: body.name ?? recruitment.name,
      description: body.description ?? recruitment.description,
      opensAt: body.opensAt ?? recruitment.opensAt,
      closesAt: body.closesAt ?? recruitment.closesAt,
      quotas: body.quotas ?? recruitment.quotas,
      rounds: body.rounds ?? recruitment.rounds,
      questions: body.questions ?? recruitment.questions,
      judgeIds: body.judgeIds ?? recruitment.judgeIds,
    }
    const { value, errors } = parseRecruitment(clubId, merged, recruitment)
    if (errors.length > 0) return problem(400, 'Thông tin đợt tuyển chưa hợp lệ.', 'VALIDATION', errors)
    Object.assign(recruitment, value)
    recruitment.version += 1
    return HttpResponse.json(toRecruitmentDetail(recruitment, user.value.id))
  }),

  http.get(`${API}/clubs/:clubId/recruitment-judge-candidates`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!canManageRecruitment(user.value.id, clubId)) return forbidden(clubId, 'MANAGE_MEMBERS', 'chọn giám khảo')
    return HttpResponse.json(judgeCandidates(clubId, new URL(request.url).searchParams.get('q')))
  }),
]

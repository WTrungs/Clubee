import { http, HttpResponse } from 'msw'
import type {
  ApplicationStatus,
  FinalizeRequest,
  RecruitmentRequest,
  RoundResultRequest,
  RoundState,
  SubmitApplicationRequest,
  UpdateRecruitmentRequest,
} from '@/features/recruitment/model/recruitmentTypes'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { ROUND_NOTE_MAX, ROUND_SCORE_MAX, ROUND_SCORE_MIN } from '@/shared/lib/recruitmentRules'
import { matchesKeyword } from '@/shared/lib/searchText'
import { db, type DbRecruitment } from '../db'
import { forbidden } from '../mockAccess'
import { API, currentUser, networkDelay, newId, paginate, problem, writer } from '../mockHttp'
import {
  ALREADY_MEMBER_MESSAGE,
  applicationOf,
  canSeePublicRecruitment,
  currentRoundOf,
  hasCurrentMembership,
  compareOutcome,
  matchesRound,
  outcomeGroupOf,
  roundEditable,
  setRoundResult,
  parseApplication,
  toApplicationDetail,
  toApplicationSummary,
  toMyApplication,
  toOpenRecruitment,
  toPublicRecruitment,
} from '../mockApplications'
import { canAccessClub, personRef } from '../mockMembers'
import { isBoardMember } from '../mockPermissions'
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
import {
  admissionBlocker,
  callNextReserve,
  canRespond,
  checkDecisions,
  departmentResultsOf,
  finalizationBlockers,
  finalizeRecruitment,
  respondToAdmission,
  resultProposal,
} from '../mockRecruitmentResults'
import { nowIso } from '../mockTime'

const notMember = () => problem(403, 'Bạn không phải thành viên của CLB này.', 'NOT_A_MEMBER')
const findRecruitment = (clubId: string, id: unknown) => db.recruitments.find((recruitment) => recruitment.id === id && recruitment.clubId === clubId)
const APPLICATION_STATUSES: ApplicationStatus[] = ['SUBMITTED', 'WITHDRAWN', 'ELIMINATED', 'ADMITTED', 'RESERVE', 'NOT_ADMITTED', 'ACCEPTED', 'DECLINED']
const ROUND_STATES: RoundState[] = ['PENDING', 'PASSED', 'FAILED']
/** SRS 3.5: đơn ứng tuyển chỉ ban chủ nhiệm xem (giám khảo xem đơn được phân ở P2). */
const boardOnly = () => problem(403, 'Chỉ ban chủ nhiệm xem được đơn ứng tuyển.', 'FORBIDDEN')

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
    const recruitment: DbRecruitment = { id: newId('rec'), clubId, ...value, createdBy: user.value.id, createdAt: nowIso(), finalizedAt: null, responseDays: null, closedAt: null, version: 1 }
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

  http.get(`${API}/clubs/:clubId/recruitments/:recruitmentId/applications`, async ({ request, params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return boardOnly()
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const departmentId = url.searchParams.get('departmentId')
    const roundId = url.searchParams.get('roundId')
    const roundState = url.searchParams.get('roundState')
    const outcome = url.searchParams.get('outcome')
    if (outcome !== null && !['ADMITTED', 'RESERVE', 'NOT_ADMITTED'].includes(outcome)) return problem(400, 'Nhóm kết quả không hợp lệ.', 'VALIDATION')
    if (status !== null && !APPLICATION_STATUSES.includes(status as ApplicationStatus)) return problem(400, 'Trạng thái đơn không hợp lệ.', 'VALIDATION')
    const badRound = roundId !== null && !recruitment.rounds.some((round) => round.id === roundId)
    // `roundState` chỉ có nghĩa khi đi cùng `roundId`.
    if (badRound || (roundState !== null && (roundId === null || !ROUND_STATES.includes(roundState as RoundState)))) {
      return problem(400, 'Bộ lọc vòng không hợp lệ.', 'VALIDATION')
    }
    const rows = db.applications
      .filter((application) => application.recruitmentId === recruitment.id)
      .filter((application) => status === null || application.status === status)
      .filter((application) => !departmentId || application.choices.includes(departmentId))
      .filter((application) => roundId === null || matchesRound(application, roundId, roundState as RoundState | null))
      .filter((application) => outcome === null || outcomeGroupOf(application) === outcome)
      .filter((application) => matchesKeyword(personRef(application.userId).fullName, url.searchParams.get('q')))
      // Nhóm kết quả xếp theo ban rồi thứ tự dự bị; còn lại theo thời điểm nộp.
      .toSorted((a, b) => (outcome === null ? 0 : compareOutcome(a, b)) || a.submittedAt.localeCompare(b.submittedAt))
      .map(toApplicationSummary)
    return HttpResponse.json(paginate(rows, url, 50))
  }),

  http.get(`${API}/clubs/:clubId/recruitments/:recruitmentId/applications/:applicationId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return boardOnly()
    const application = db.applications.find((candidate) => candidate.id === params.applicationId && candidate.recruitmentId === params.recruitmentId && candidate.clubId === clubId)
    if (!application) return problem(404, 'Không tìm thấy đơn ứng tuyển.', 'APPLICATION_NOT_FOUND')
    return HttpResponse.json(toApplicationDetail(application))
  }),

  http.put(`${API}/clubs/:clubId/recruitments/:recruitmentId/applications/:applicationId/rounds/:roundId`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm xét đơn theo vòng.', 'FORBIDDEN')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    const application = db.applications.find((candidate) => candidate.id === params.applicationId && candidate.recruitmentId === recruitment?.id)
    const roundIndex = recruitment?.rounds.findIndex((round) => round.id === params.roundId) ?? -1
    if (!recruitment || !application || roundIndex < 0) return problem(404, 'Không tìm thấy đơn hoặc vòng.', 'APPLICATION_NOT_FOUND')
    const body = (await request.json()) as Partial<RoundResultRequest>
    if (body.version !== application.version) return problem(409, 'Đơn vừa được người khác xét. Tải lại để xem kết quả mới nhất.', 'VERSION_CONFLICT')
    const status = recruitmentStatusOf(recruitment)
    if (status === 'RESULTS' || status === 'CLOSED') return problem(422, 'Đợt tuyển đã chốt kết quả nên không sửa kết quả vòng được.', 'RECRUITMENT_FINALIZED')
    if (application.status === 'WITHDRAWN') return problem(422, 'Ứng viên đã rút đơn.', 'APPLICATION_WITHDRAWN')
    const roundId = String(params.roundId)
    const existing = application.roundResults.some((result) => result.roundId === roundId)
    if (!existing && currentRoundOf(application, recruitment) !== roundId) {
      return problem(422, 'Đơn chưa tới vòng này (vòng trước chưa có kết quả hoặc đã bị loại).', 'ROUND_NOT_REACHED')
    }
    if (existing && !roundEditable(application, recruitment, roundIndex)) return problem(422, 'Vòng sau đã có kết quả nên không sửa vòng này được nữa.', 'ROUND_LOCKED')
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const errors = [
      ...(body.result !== 'PASS' && body.result !== 'FAIL' ? [{ field: 'result', message: 'Chọn Đạt hoặc Loại.' }] : []),
      ...(body.result === 'PASS' && (typeof body.score !== 'number' || !Number.isInteger(body.score) || body.score < ROUND_SCORE_MIN || body.score > ROUND_SCORE_MAX)
        ? [{ field: 'score', message: `Điểm là số nguyên từ ${ROUND_SCORE_MIN} đến ${ROUND_SCORE_MAX}.` }]
        : []),
      ...(body.result === 'FAIL' && (note.length < REASON_MIN || note.length > REASON_MAX) ? [{ field: 'note', message: `Nhập nhận xét từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` }] : []),
      ...(body.result === 'PASS' && note.length > ROUND_NOTE_MAX ? [{ field: 'note', message: `Nhận xét tối đa ${ROUND_NOTE_MAX} ký tự.` }] : []),
    ]
    if (errors.length > 0) return problem(400, 'Kết quả vòng chưa hợp lệ.', 'VALIDATION', errors)
    setRoundResult(application, roundId, { result: body.result as 'PASS' | 'FAIL', score: body.result === 'PASS' ? (body.score as number) : null, note, by: user.value.id })
    return HttpResponse.json(toApplicationDetail(application))
  }),

  http.get(`${API}/clubs/:clubId/recruitments/:recruitmentId/result-proposal`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm chốt kết quả tuyển.', 'FORBIDDEN')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    return HttpResponse.json(resultProposal(recruitment))
  }),

  http.post(`${API}/clubs/:clubId/recruitments/:recruitmentId/finalization`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm chốt kết quả tuyển.', 'FORBIDDEN')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    const body = (await request.json()) as Partial<FinalizeRequest>
    if (body.version !== recruitment.version) return problem(409, 'Đợt tuyển vừa thay đổi. Tải lại đề xuất rồi chốt lại.', 'VERSION_CONFLICT')
    const status = recruitmentStatusOf(recruitment)
    if (status === 'RESULTS' || status === 'CLOSED') return problem(422, 'Đợt tuyển đã chốt kết quả.', 'RECRUITMENT_FINALIZED')
    if (status !== 'REVIEWING') return problem(422, 'Chỉ chốt kết quả sau giờ đóng nhận đơn.', 'RECRUITMENT_STILL_OPEN')
    const blockers = finalizationBlockers(recruitment)
    if (blockers.length > 0) return problem(422, blockers.join(' '), 'ROUNDS_INCOMPLETE')
    const { errors, overQuota } = checkDecisions(recruitment, body)
    if (overQuota.length > 0) return problem(422, `Số trúng tuyển vượt chỉ tiêu ở ban ${overQuota.join(', ')}.`, 'QUOTA_EXCEEDED')
    if (errors.length > 0) return problem(400, 'Kết quả chưa hợp lệ.', 'VALIDATION', errors)
    finalizeRecruitment(recruitment, body as FinalizeRequest, user.value.id)
    return HttpResponse.json(toRecruitmentDetail(recruitment, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/recruitments/:recruitmentId/reserve-calls`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm gọi người dự bị.', 'FORBIDDEN')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    const body = (await request.json()) as { departmentId?: string; version?: number }
    if (body.version !== recruitment.version) return problem(409, 'Đợt tuyển vừa thay đổi. Tải lại để xem chỗ trống mới nhất.', 'VERSION_CONFLICT')
    if (recruitmentStatusOf(recruitment) !== 'RESULTS') return problem(422, 'Chỉ gọi dự bị sau khi chốt kết quả và trước khi đóng đợt.', 'RECRUITMENT_NOT_FINALIZED')
    const result = departmentResultsOf(recruitment).find((candidate) => candidate.departmentId === body.departmentId)
    if (!result) return problem(400, 'Chọn ban có chỉ tiêu trong đợt.', 'VALIDATION', [{ field: 'departmentId', message: 'Chọn ban có chỉ tiêu trong đợt.' }])
    if (result.freeSlots === 0) return problem(422, `Ban ${result.departmentName} không còn chỗ trống.`, 'NO_FREE_SLOT')
    if (result.reserves === 0) return problem(422, `Ban ${result.departmentName} không còn người dự bị.`, 'NO_RESERVE')
    callNextReserve(recruitment, result.departmentId, user.value.id)
    return HttpResponse.json(toRecruitmentDetail(recruitment, user.value.id))
  }),

  http.post(`${API}/clubs/:clubId/recruitments/:recruitmentId/closure`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const clubId = String(params.clubId)
    if (!canAccessClub(user.value.id, clubId)) return notMember()
    if (!isBoardMember(user.value.id, clubId)) return problem(403, 'Chỉ ban chủ nhiệm đóng đợt tuyển.', 'FORBIDDEN')
    const recruitment = findRecruitment(clubId, params.recruitmentId)
    if (!recruitment) return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    const body = (await request.json()) as { version?: number }
    if (body.version !== recruitment.version) return problem(409, 'Đợt tuyển vừa thay đổi. Tải lại rồi thử lại.', 'VERSION_CONFLICT')
    if (recruitmentStatusOf(recruitment) !== 'RESULTS') return problem(422, 'Chỉ đóng đợt sau khi đã chốt kết quả.', 'RECRUITMENT_NOT_FINALIZED')
    const waiting = db.applications.filter((application) => application.recruitmentId === recruitment.id && application.status === 'ADMITTED').length
    if (waiting > 0) return problem(422, `Còn ${waiting} người trúng tuyển chưa trả lời.`, 'RESPONSES_PENDING')
    recruitment.closedAt = nowIso()
    recruitment.version += 1
    return HttpResponse.json(toRecruitmentDetail(recruitment, user.value.id))
  }),

  http.post(`${API}/me/applications/:applicationId/response`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const application = db.applications.find((candidate) => candidate.id === params.applicationId && candidate.userId === user.value.id)
    if (!application) return problem(404, 'Không tìm thấy đơn của bạn.', 'APPLICATION_NOT_FOUND')
    const body = (await request.json()) as { decision?: string; version?: number }
    if (body.version !== application.version) return problem(409, 'Đơn vừa thay đổi. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    if (application.status !== 'ADMITTED') return problem(422, 'Chỉ trả lời được khi đơn đang Trúng tuyển.', 'APPLICATION_NOT_ADMITTED')
    if (!canRespond(application)) return problem(422, 'Đã quá hạn nhận kết quả.', 'RESPONSE_EXPIRED')
    if (body.decision !== 'ACCEPT' && body.decision !== 'DECLINE') return problem(400, 'Chọn Nhận hoặc Từ chối.', 'VALIDATION', [{ field: 'decision', message: 'Chọn Nhận hoặc Từ chối.' }])
    if (body.decision === 'ACCEPT') {
      const blocked = admissionBlocker(application)
      if (blocked) return problem(422, blocked.message, blocked.code)
    }
    respondToAdmission(application, body.decision, user.value.id)
    return HttpResponse.json(toMyApplication(application))
  }),

  http.get(`${API}/recruitments/open`, async ({ request }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const url = new URL(request.url)
    const rows = db.recruitments
      .filter((recruitment) => recruitmentStatusOf(recruitment) === 'OPEN')
      .map(toOpenRecruitment)
      .filter((row) => matchesKeyword(`${row.name} ${row.club.name}`, url.searchParams.get('q')))
      .toSorted((a, b) => a.closesAt.localeCompare(b.closesAt))
    return HttpResponse.json(paginate(rows, url, 20))
  }),

  http.get(`${API}/recruitments/:recruitmentId`, async ({ params }) => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const recruitment = db.recruitments.find((candidate) => candidate.id === params.recruitmentId)
    if (!recruitment || !canSeePublicRecruitment(recruitment, user.value.id, canAccessClub(user.value.id, recruitment.clubId))) {
      return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    }
    return HttpResponse.json(toPublicRecruitment(recruitment, user.value.id))
  }),

  http.post(`${API}/recruitments/:recruitmentId/applications`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const recruitment = db.recruitments.find((candidate) => candidate.id === params.recruitmentId)
    if (!recruitment || recruitmentStatusOf(recruitment) === 'UPCOMING') return problem(404, 'Không tìm thấy đợt tuyển.', 'RECRUITMENT_NOT_FOUND')
    if (applicationOf(recruitment.id, user.value.id)) return problem(409, 'Bạn đã nộp đơn cho đợt tuyển này (kể cả đơn đã rút).', 'ALREADY_APPLIED')
    if (hasCurrentMembership(user.value.id, recruitment.clubId)) return problem(422, ALREADY_MEMBER_MESSAGE, 'ALREADY_MEMBER')
    if (recruitmentStatusOf(recruitment) !== 'OPEN') return problem(422, 'Đợt tuyển đã hết thời gian nhận đơn.', 'RECRUITMENT_NOT_OPEN')
    const body = (await request.json()) as Partial<SubmitApplicationRequest>
    const { value, errors } = parseApplication(recruitment, body)
    if (errors.length > 0) return problem(400, 'Đơn chưa hợp lệ.', 'VALIDATION', errors)
    const application = {
      id: newId('ap'),
      recruitmentId: recruitment.id,
      clubId: recruitment.clubId,
      userId: user.value.id,
      ...value,
      status: 'SUBMITTED' as const,
      submittedAt: nowIso(),
      withdrawnAt: null,
      roundResults: [],
      outcome: null,
      version: 1,
    }
    db.applications.push(application)
    return HttpResponse.json(toMyApplication(application), { status: 201 })
  }),

  http.get(`${API}/me/applications`, async () => {
    await networkDelay()
    const user = currentUser()
    if (!user.ok) return user.response
    const rows = db.applications
      .filter((application) => application.userId === user.value.id)
      .toSorted((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map(toMyApplication)
    return HttpResponse.json(rows)
  }),

  http.post(`${API}/me/applications/:applicationId/withdrawal`, async ({ request, params }) => {
    await networkDelay()
    const user = writer(request)
    if (!user.ok) return user.response
    const application = db.applications.find((candidate) => candidate.id === params.applicationId && candidate.userId === user.value.id)
    if (!application) return problem(404, 'Không tìm thấy đơn của bạn.', 'APPLICATION_NOT_FOUND')
    const body = (await request.json()) as { version?: number }
    if (body.version !== application.version) return problem(409, 'Đơn vừa thay đổi. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT')
    if (!toMyApplication(application).allowedActions.includes('WITHDRAW')) {
      return problem(422, 'Chỉ rút được đơn Đã nộp khi đợt tuyển còn nhận đơn.', 'APPLICATION_NOT_WITHDRAWABLE')
    }
    Object.assign(application, { status: 'WITHDRAWN', withdrawnAt: nowIso() })
    application.version += 1
    return HttpResponse.json(toMyApplication(application))
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

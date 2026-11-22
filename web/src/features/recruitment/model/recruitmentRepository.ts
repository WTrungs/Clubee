import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  ApplicationDetail,
  ApplicationQuery,
  ApplicationSummary,
  JudgeCandidate,
  MyApplication,
  OpenRecruitment,
  PublicRecruitment,
  RecruitmentDetail,
  RecruitmentRequest,
  RecruitmentSummary,
  RoundResultRequest,
  SubmitApplicationRequest,
  UpdateRecruitmentRequest,
} from './recruitmentTypes'

const recruitments = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/recruitments`

export const recruitmentRepository = {
  /** FR-REC-01: chỉ người có quyền Quản lý thành viên. */
  list: (clubId: string, page = 0) => httpClient.get<Page<RecruitmentSummary>>(recruitments(clubId), { query: { page } }),
  get: (clubId: string, recruitmentId: string) => httpClient.get<RecruitmentDetail>(`${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}`),
  create: (clubId: string, request: RecruitmentRequest) => httpClient.post<RecruitmentDetail>(recruitments(clubId), request),
  /** Sau giờ mở: giờ mở, vòng, câu hỏi khóa (422 `RECRUITMENT_STARTED`); giờ đóng chỉ lùi. */
  update: (clubId: string, recruitmentId: string, request: UpdateRecruitmentRequest) =>
    httpClient.patch<RecruitmentDetail>(`${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}`, request),
  /** FR-REC-02: ban chủ nhiệm xem đơn của đợt (SRS 3.5). */
  applications: (clubId: string, recruitmentId: string, query: ApplicationQuery) =>
    httpClient.get<Page<ApplicationSummary>>(`${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}/applications`, {
      query: { status: query.status, departmentId: query.departmentId, roundId: query.roundId, roundState: query.roundState, q: query.q, page: query.page },
    }),
  application: (clubId: string, recruitmentId: string, applicationId: string) =>
    httpClient.get<ApplicationDetail>(`${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}/applications/${encodeURIComponent(applicationId)}`),
  /** FR-REC-03: ghi hoặc sửa kết quả một vòng; Đạt kèm điểm 0–100, Loại kèm nhận xét. */
  reviewRound: (clubId: string, recruitmentId: string, applicationId: string, roundId: string, request: RoundResultRequest) =>
    httpClient.put<ApplicationDetail>(
      `${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}/applications/${encodeURIComponent(applicationId)}/rounds/${encodeURIComponent(roundId)}`,
      request,
    ),
  /** FR-REC-02: đợt đang nhận đơn ở mọi CLB; cần đăng nhập. */
  openRecruitments: (q?: string, page = 0) => httpClient.get<Page<OpenRecruitment>>('/recruitments/open', { query: { q, page } }),
  publicRecruitment: (recruitmentId: string) => httpClient.get<PublicRecruitment>(`/recruitments/${encodeURIComponent(recruitmentId)}`),
  /** Mỗi đợt một đơn, tính cả đơn đã rút (409 `ALREADY_APPLIED`); đang có tư cách ở CLB thì 422 `ALREADY_MEMBER`. */
  apply: (recruitmentId: string, request: SubmitApplicationRequest) => httpClient.post<MyApplication>(`/recruitments/${encodeURIComponent(recruitmentId)}/applications`, request),
  myApplications: () => httpClient.get<MyApplication[]>('/me/applications'),
  withdraw: (applicationId: string, version: number) => httpClient.post<MyApplication>(`/me/applications/${encodeURIComponent(applicationId)}/withdrawal`, { version }),
  judgeCandidates: (clubId: string, q?: string) =>
    httpClient.get<JudgeCandidate[]>(`/clubs/${encodeURIComponent(clubId)}/recruitment-judge-candidates`, { query: { q } }),
}

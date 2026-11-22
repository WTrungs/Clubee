import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { JudgeCandidate, RecruitmentDetail, RecruitmentRequest, RecruitmentSummary, UpdateRecruitmentRequest } from './recruitmentTypes'

const recruitments = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}/recruitments`

export const recruitmentRepository = {
  /** FR-REC-01: chỉ người có quyền Quản lý thành viên. */
  list: (clubId: string, page = 0) => httpClient.get<Page<RecruitmentSummary>>(recruitments(clubId), { query: { page } }),
  get: (clubId: string, recruitmentId: string) => httpClient.get<RecruitmentDetail>(`${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}`),
  create: (clubId: string, request: RecruitmentRequest) => httpClient.post<RecruitmentDetail>(recruitments(clubId), request),
  /** Sau giờ mở: giờ mở, vòng, câu hỏi khóa (422 `RECRUITMENT_STARTED`); giờ đóng chỉ lùi. */
  update: (clubId: string, recruitmentId: string, request: UpdateRecruitmentRequest) =>
    httpClient.patch<RecruitmentDetail>(`${recruitments(clubId)}/${encodeURIComponent(recruitmentId)}`, request),
  judgeCandidates: (clubId: string, q?: string) =>
    httpClient.get<JudgeCandidate[]>(`/clubs/${encodeURIComponent(clubId)}/recruitment-judge-candidates`, { query: { q } }),
}

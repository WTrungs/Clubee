import { httpClient } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type { BacklogCandidate, BacklogItem, BacklogQuery, ResolveBacklogRequest } from './backlogTypes'
import type { CreateInvitationRequest, Invitation, InvitationPreview, InvitationQuery } from './invitationTypes'
import type {
  CreateJoinRequest,
  DepartmentTransferRequest,
  DepartmentTransferResult,
  JoinRequest,
  JoinRequestReceipt,
  LeaveDecisionRequest,
  LeaveRequest,
  LeaveRequestQuery,
  MemberDetail,
  MemberFacets,
  MemberQuery,
  MemberSummary,
  MemberTransitionRequest,
  MyMembership,
  MyMembershipTransitionRequest,
  UpdateMemberInfoRequest,
} from './memberTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`
const member = (clubId: string, membershipId: string) => `${club(clubId)}/members/${encodeURIComponent(membershipId)}`

export const memberRepository = {
  /** FR-MEM-04: trường trả về theo phạm vi xem của người gọi (SRS 3.5). */
  list: (clubId: string, query: MemberQuery) =>
    httpClient.get<Page<MemberSummary>>(`${club(clubId)}/members`, {
      query: {
        q: query.q,
        status: query.status,
        departmentId: query.departmentId,
        role: query.role,
        joinYear: query.joinYear,
        page: query.page,
        size: query.size,
      },
    }),
  /** FR-MEM-11: tệp Excel theo bộ lọc đang chọn, chỉ trường người xuất được xem; máy chủ ghi nhật ký. */
  exportList: (clubId: string, query: MemberQuery) =>
    httpClient.download(`${club(clubId)}/members/export`, {
      query: { format: 'xlsx', q: query.q, status: query.status, departmentId: query.departmentId, role: query.role, joinYear: query.joinYear },
    }),
  facets: (clubId: string) => httpClient.get<MemberFacets>(`${club(clubId)}/members/facets`),
  get: (clubId: string, membershipId: string) => httpClient.get<MemberDetail>(member(clubId, membershipId)),
  /** FR-MEM-05: chức danh hiển thị, ghi chú nội bộ, MSSV, ngày gia nhập. */
  updateInfo: (clubId: string, membershipId: string, request: UpdateMemberInfoRequest) => httpClient.patch<MemberDetail>(member(clubId, membershipId), request),
  transition: (clubId: string, membershipId: string, request: MemberTransitionRequest) =>
    httpClient.post<MemberDetail>(`${member(clubId, membershipId)}/transitions`, request),
  /** FR-MEM-10: chuyển ban chính một hoặc nhiều người cùng lúc. */
  transferDepartment: (clubId: string, request: DepartmentTransferRequest) => httpClient.post<DepartmentTransferResult>(`${club(clubId)}/department-transfers`, request),
  /** FR-MEM-07: tư cách của chính người gọi, yêu cầu tạm nghỉ và các khoản còn tồn. */
  myMembership: (clubId: string) => httpClient.get<MyMembership>(`${club(clubId)}/my-membership`),
  requestLeave: (clubId: string, reason: string) => httpClient.post<MyMembership>(`${club(clubId)}/my-membership/leave-requests`, { reason }),
  withdrawLeave: (clubId: string, requestId: string, version: number) =>
    httpClient.post<MyMembership>(`${club(clubId)}/my-membership/leave-requests/${encodeURIComponent(requestId)}/withdrawal`, { version }),
  transitionMine: (clubId: string, request: MyMembershipTransitionRequest) => httpClient.post<MyMembership>(`${club(clubId)}/my-membership/transitions`, request),
  /** FR-MEM-07: yêu cầu tạm nghỉ cho người quản lý thành viên. */
  leaveRequests: (clubId: string, query: LeaveRequestQuery) =>
    httpClient.get<Page<LeaveRequest>>(`${club(clubId)}/leave-requests`, { query: { status: query.status, page: query.page, size: query.size } }),
  decideLeave: (clubId: string, requestId: string, request: LeaveDecisionRequest) =>
    httpClient.post<LeaveRequest>(`${club(clubId)}/leave-requests/${encodeURIComponent(requestId)}/decision`, request),
  /** FR-MEM-03: yêu cầu đang chờ, chỉ ban chủ nhiệm. */
  joinRequests: (clubId: string, query: { page?: number; size?: number }) =>
    httpClient.get<Page<JoinRequest>>(`${club(clubId)}/join-requests`, { query }),
  /** FR-MEM-02; gửi từ trang lời mời thì kèm `invitationToken` (FR-MEM-01). */
  requestToJoin: (clubId: string, request: CreateJoinRequest) => httpClient.post<JoinRequestReceipt>(`${club(clubId)}/join-requests`, request),
  /** FR-MEM-01: lời mời của CLB, cho người quản lý thành viên. */
  invitations: (clubId: string, query: InvitationQuery) =>
    httpClient.get<Page<Invitation>>(`${club(clubId)}/invitations`, { query: { status: query.status, page: query.page, size: query.size } }),
  createInvitation: (clubId: string, request: CreateInvitationRequest) => httpClient.post<Invitation>(`${club(clubId)}/invitations`, request),
  revokeInvitation: (clubId: string, invitationId: string, version: number) =>
    httpClient.post<Invitation>(`${club(clubId)}/invitations/${encodeURIComponent(invitationId)}/revocation`, { version }),
  /** Người mở liên kết mời xem CLB, người mời, hạn (cần đăng nhập). */
  invitationPreview: (token: string) => httpClient.get<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`),
  /** FR-MEM-09: tồn đọng của người bị đưa ra, chỉ ban chủ nhiệm. */
  backlog: (clubId: string, query: BacklogQuery) =>
    httpClient.get<Page<BacklogItem>>(`${club(clubId)}/backlog-items`, {
      query: { status: query.status, kind: query.kind, formerMemberId: query.formerMemberId, page: query.page, size: query.size },
    }),
  backlogCandidates: (clubId: string, itemId: string, q?: string) =>
    httpClient.get<BacklogCandidate[]>(`${club(clubId)}/backlog-items/${encodeURIComponent(itemId)}/candidates`, { query: { q } }),
  resolveBacklog: (clubId: string, itemId: string, request: ResolveBacklogRequest) =>
    httpClient.post<BacklogItem>(`${club(clubId)}/backlog-items/${encodeURIComponent(itemId)}/resolution`, request),
}

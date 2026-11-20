import type { BacklogQuery } from '../model/backlogTypes'
import type { InvitationQuery } from '../model/invitationTypes'
import type { LeaveRequestQuery, MemberQuery } from '../model/memberTypes'

export const memberQueryKeys = {
  all: ['members'] as const,
  lists: ['members', 'list'] as const,
  list: (clubId: string, query: MemberQuery) => ['members', 'list', clubId, query] as const,
  facets: (clubId: string) => ['members', 'facets', clubId] as const,
  detail: (clubId: string, membershipId: string) => ['members', 'detail', clubId, membershipId] as const,
  requests: (clubId: string, page: number) => ['members', 'requests', clubId, page] as const,
  mine: (clubId: string) => ['members', 'mine', clubId] as const,
  leaveRequests: (clubId: string, query: LeaveRequestQuery) => ['members', 'leaveRequests', clubId, query] as const,
  invitationLists: (clubId: string) => ['members', 'invitations', clubId] as const,
  invitations: (clubId: string, query: InvitationQuery) => ['members', 'invitations', clubId, query] as const,
  /** Không nằm dưới `members`: người mở liên kết mời chưa thuộc CLB nào trong ngữ cảnh. */
  invitationPreview: (token: string) => ['invitationPreview', token] as const,
  backlog: (clubId: string, query: BacklogQuery) => ['members', 'backlog', clubId, query] as const,
  backlogCandidates: (clubId: string, itemId: string, q: string) => ['members', 'backlogCandidates', clubId, itemId, q] as const,
}

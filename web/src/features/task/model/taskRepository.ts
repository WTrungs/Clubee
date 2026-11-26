import { httpClient, type QueryParams } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AssignableScope,
  CreateTaskCommentRequest,
  CreateTaskRequest,
  FileRef,
  TaskComment,
  TaskCommentList,
  TaskDetail,
  TaskFacets,
  TaskQuery,
  TaskSummary,
  TaskTransitionRequest,
  UpdateTaskRequest,
  Workload,
  WorkloadScope,
} from './taskTypes'

const club = (clubId: string) => `/clubs/${encodeURIComponent(clubId)}`
const task = (clubId: string, taskId: string) => `${club(clubId)}/tasks/${encodeURIComponent(taskId)}`

function toParams(query: TaskQuery): QueryParams {
  return {
    status: query.status,
    priority: query.priority,
    due: query.due,
    clubId: query.clubId,
    eventId: query.eventId,
    q: query.q,
    page: query.page,
    size: query.size,
    sort: query.sort,
  }
}

export const taskRepository = {
  /** FR-TASK-08: phạm vi người gọi được xem khối lượng việc. */
  workloadScopes: (clubId: string) => httpClient.get<WorkloadScope[]>(`${club(clubId)}/workload-scopes`),
  workload: (clubId: string, scope: Pick<WorkloadScope, 'type' | 'id'>) =>
    httpClient.get<Workload>(`${club(clubId)}/workload`, { query: { scopeType: scope.type, scopeId: scope.id ?? undefined } }),
  /** FR-TASK-02: việc của tôi từ mọi ban, tiểu ban và CLB. */
  listMine: (query: TaskQuery) => httpClient.get<Page<TaskSummary>>('/me/tasks', { query: toParams(query) }),
  myFacets: () => httpClient.get<TaskFacets>('/me/tasks/facets'),
  listInClub: (clubId: string, query: TaskQuery) => httpClient.get<Page<TaskSummary>>(`${club(clubId)}/tasks`, { query: toParams(query) }),
  get: (clubId: string, taskId: string) => httpClient.get<TaskDetail>(task(clubId, taskId)),
  create: (clubId: string, request: CreateTaskRequest) => httpClient.post<TaskDetail>(`${club(clubId)}/tasks`, request),
  transition: (clubId: string, taskId: string, request: TaskTransitionRequest) =>
    httpClient.post<TaskDetail>(`${task(clubId, taskId)}/transitions`, request),
  /** FR-TASK-05: đổi người chính, người phối hợp hoặc hạn, kèm lý do. */
  update: (clubId: string, taskId: string, request: UpdateTaskRequest) => httpClient.patch<TaskDetail>(task(clubId, taskId), request),
  uploadAttachment: (clubId: string, taskId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return httpClient.post<FileRef>(`${task(clubId, taskId)}/attachments`, form)
  },
  assignableScopes: (clubId: string) => httpClient.get<AssignableScope[]>(`${club(clubId)}/task-scopes`),
  /** FR-TASK-07: bình luận, ẩn bình luận, tải tệp của kết quả và bình luận. */
  comments: (clubId: string, taskId: string) => httpClient.get<TaskCommentList>(`${task(clubId, taskId)}/comments`),
  addComment: (clubId: string, taskId: string, request: CreateTaskCommentRequest) => httpClient.post<TaskComment>(`${task(clubId, taskId)}/comments`, request),
  hideComment: (clubId: string, taskId: string, commentId: string) => httpClient.post<TaskComment>(`${task(clubId, taskId)}/comments/${encodeURIComponent(commentId)}/hiding`),
  downloadAttachment: (clubId: string, taskId: string, attachmentId: string) => httpClient.download(`${task(clubId, taskId)}/attachments/${encodeURIComponent(attachmentId)}/file`),
}

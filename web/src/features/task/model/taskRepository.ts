import { httpClient, type QueryParams } from '@/api/httpClient'
import type { Page } from '@/api/pagination'
import type {
  AssignableScope,
  CreateTaskRequest,
  FileRef,
  TaskDetail,
  TaskFacets,
  TaskQuery,
  TaskSummary,
  TaskTransitionRequest,
  UpdateTaskRequest,
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
}

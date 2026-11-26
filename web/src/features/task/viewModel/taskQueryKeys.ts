import type { TaskQuery, WorkloadScope } from '../model/taskTypes'

export const taskQueryKeys = {
  all: ['tasks'] as const,
  lists: ['tasks', 'list'] as const,
  mine: (query: TaskQuery) => ['tasks', 'list', 'mine', query] as const,
  club: (clubId: string, query: TaskQuery) => ['tasks', 'list', 'club', clubId, query] as const,
  facets: ['tasks', 'facets'] as const,
  detail: (clubId: string, taskId: string) => ['tasks', 'detail', clubId, taskId] as const,
  scopes: (clubId: string) => ['tasks', 'scopes', clubId] as const,
  comments: (clubId: string, taskId: string) => ['tasks', 'comments', clubId, taskId] as const,
  workloadScopes: (clubId: string) => ['tasks', 'workloadScopes', clubId] as const,
  workload: (clubId: string, scope: Pick<WorkloadScope, 'type' | 'id'>) => ['tasks', 'workload', clubId, scope.type, scope.id] as const,
}

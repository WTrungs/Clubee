import type { TaskQuery } from '../model/taskTypes'

export const taskQueryKeys = {
  all: ['tasks'] as const,
  lists: ['tasks', 'list'] as const,
  mine: (query: TaskQuery) => ['tasks', 'list', 'mine', query] as const,
  club: (clubId: string, query: TaskQuery) => ['tasks', 'list', 'club', clubId, query] as const,
  facets: ['tasks', 'facets'] as const,
  detail: (clubId: string, taskId: string) => ['tasks', 'detail', clubId, taskId] as const,
  scopes: (clubId: string) => ['tasks', 'scopes', clubId] as const,
}

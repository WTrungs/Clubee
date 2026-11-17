import { useQuery } from '@tanstack/react-query'
import { useCurrentUser } from '@/features/account/viewModel/useSession'
import { taskRepository } from '../model/taskRepository'
import type { TaskDetail } from '../model/taskTypes'
import { footerActions, menuActions } from './taskDisplay'
import { taskQueryKeys } from './taskQueryKeys'

export type ViewerRole = 'owner' | 'assigner' | 'collaborator' | 'viewer'

/** Vai trò của người đang xem với việc, chỉ để hiện câu hướng dẫn; quyền thao tác vẫn theo allowedActions. */
export function viewerRoleOf(task: Pick<TaskDetail, 'owner' | 'assigner' | 'collaborators'>, userId: string): ViewerRole {
  if (task.owner.id === userId) return 'owner'
  if (task.assigner.id === userId) return 'assigner'
  if (task.collaborators.some((person) => person.id === userId)) return 'collaborator'
  return 'viewer'
}

export function useTaskDetailViewModel(selection: { clubId: string; taskId: string } | null) {
  const user = useCurrentUser()
  const detail = useQuery({
    queryKey: taskQueryKeys.detail(selection?.clubId ?? '', selection?.taskId ?? ''),
    queryFn: () => taskRepository.get(selection?.clubId ?? '', selection?.taskId ?? ''),
    enabled: selection !== null,
  })
  const task = detail.data ?? null
  return {
    task,
    loading: detail.isPending && selection !== null,
    error: detail.error,
    refetch: () => void detail.refetch(),
    actions: task ? footerActions(task) : [],
    menuActions: task ? menuActions(task) : [],
    viewerRole: task ? viewerRoleOf(task, user.id) : 'viewer',
  }
}

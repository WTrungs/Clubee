import { PageHeader } from '@/shared/ui/PageHeader'
import { useTaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'
import { TaskWorkspace } from './TaskWorkspace'

/** FR-TASK-02: việc bạn là người chính hoặc người phối hợp, gom từ mọi ban, tiểu ban và CLB. */
export function MyTasksPage() {
  const vm = useTaskWorkspaceViewModel({ kind: 'mine' })
  return (
    <div>
      <PageHeader title="Công việc của tôi" description="Việc bạn là người chính hoặc người phối hợp, từ mọi CLB bạn tham gia." />
      <TaskWorkspace vm={vm} showClub />
    </div>
  )
}

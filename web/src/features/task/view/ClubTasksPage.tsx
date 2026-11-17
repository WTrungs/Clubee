import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useTaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'
import { AssignTaskSheet } from './AssignTaskSheet'
import { TaskWorkspace } from './TaskWorkspace'

export function ClubTasksPage() {
  const { clubId, club } = useCurrentClub()
  const vm = useTaskWorkspaceViewModel({ kind: 'club', clubId })
  const [assignOpen, setAssignOpen] = useState(false)
  const canAssign = club.allowedActions.includes('ASSIGN_TASK')

  return (
    <div>
      <PageHeader
        eyebrow={club.name}
        title="Công việc"
        description="Việc trong các ban, tiểu ban bạn tham gia hoặc phụ trách."
        actions={
          canAssign && (
            <Button onClick={() => setAssignOpen(true)}>
              <Plus aria-hidden />
              Giao việc
            </Button>
          )
        }
      />
      <TaskWorkspace vm={vm} showClub={false} />
      {canAssign && <AssignTaskSheet clubId={clubId} clubName={club.name} open={assignOpen} onOpenChange={setAssignOpen} />}
    </div>
  )
}

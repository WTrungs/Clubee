import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { Button } from '@/shared/ui/Button'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Tabs, TabsBar, TabsContent } from '@/shared/ui/Tabs'
import { useTaskWorkspaceViewModel } from '../viewModel/useTaskWorkspaceViewModel'
import { AssignTaskSheet } from './AssignTaskSheet'
import { TaskWorkspace } from './TaskWorkspace'
import { WorkloadPanel } from './WorkloadPanel'

export function ClubTasksPage() {
  const { clubId, club } = useCurrentClub()
  const vm = useTaskWorkspaceViewModel({ kind: 'club', clubId })
  const [assignOpen, setAssignOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const canAssign = club.allowedActions.includes('ASSIGN_TASK')
  const canViewWorkload = club.allowedActions.includes('VIEW_WORKLOAD')
  const view = canViewWorkload && searchParams.get('view') === 'workload' ? 'workload' : 'tasks'

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
      {canViewWorkload ? (
        <Tabs
          value={view}
          onValueChange={(value) => {
            const next = new URLSearchParams(searchParams)
            if (value === 'workload') next.set('view', 'workload')
            else next.delete('view')
            setSearchParams(next, { replace: true })
          }}
        >
          <TabsBar
            aria-label="Công việc"
            active={view}
            className="mb-5"
            items={[
              { value: 'tasks', label: 'Danh sách việc' },
              { value: 'workload', label: 'Khối lượng theo người' },
            ]}
          />
          <TabsContent value="tasks">
            <TaskWorkspace vm={vm} showClub={false} />
          </TabsContent>
          <TabsContent value="workload">
            <WorkloadPanel clubId={clubId} active={view === 'workload'} />
          </TabsContent>
        </Tabs>
      ) : (
        <TaskWorkspace vm={vm} showClub={false} />
      )}
      {canAssign && <AssignTaskSheet clubId={clubId} clubName={club.name} open={assignOpen} onOpenChange={setAssignOpen} />}
    </div>
  )
}

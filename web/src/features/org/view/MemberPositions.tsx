import { BadgeCheck, UserPlus } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { useMemberPositionsViewModel } from '../viewModel/useMemberPositionsViewModel'
import { AssignPositionSheet } from './AssignPositionSheet'
import { PositionList } from './PositionList'
import { RevokePositionDialog } from './RevokePositionDialog'

interface MemberPositionsProps {
  userId: string
  fullName: string
  /** Máy chủ cho phép gán chức vụ cho người này: thành viên Chính thức, người xem thuộc ban chủ nhiệm, CLB không đang bàn giao và nhiệm kỳ chưa quá hạn. */
  canAssign: boolean
}

/** Mục chức vụ trong hồ sơ thành viên: xem, gán, thu hồi (FR-ORG-02, 03). */
export function MemberPositions({ userId, fullName, canAssign }: MemberPositionsProps) {
  const vm = useMemberPositionsViewModel(userId)
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <BadgeCheck aria-hidden className="size-4 text-muted-foreground" />
          Chức vụ đang giữ
        </h3>
        {canAssign && (
          <Button size="sm" variant="outline" onClick={() => vm.openAssign({ userId, userName: fullName })}>
            <UserPlus aria-hidden />
            Gán chức vụ
          </Button>
        )}
      </div>
      {vm.loading && <Skeleton className="h-12 w-full" />}
      {Boolean(vm.error) && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.positions.length === 0 && <p className="text-sm text-muted-foreground">Không giữ chức vụ nào.</p>}
      {!vm.loading && !vm.error && vm.positions.length > 0 && <PositionList positions={vm.positions} show="title" onRevoke={vm.openRevoke} />}
      <AssignPositionSheet preset={vm.assign} clubName={vm.clubName} onClose={vm.closeAssign} />
      <RevokePositionDialog position={vm.revoking} onClose={vm.closeRevoke} />
    </section>
  )
}

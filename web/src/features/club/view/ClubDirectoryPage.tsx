import { motion } from 'motion/react'
import { ArrowRight, Clock, SearchX, UserPlus } from 'lucide-react'
import { ClubMonogram } from '@/features/account/view/ClubMonogram'
import { JoinRequestDialog } from '@/features/member/view/JoinRequestDialog'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { ClubDirectoryEntry } from '../model/clubTypes'
import { directoryState, useClubDirectoryViewModel } from '../viewModel/useClubDirectoryViewModel'
import { ClubContactList } from './ClubContactList'

function ClubStatus({ entry, onJoin, onEnter }: { entry: ClubDirectoryEntry; onJoin: () => void; onEnter: () => void }) {
  const state = directoryState(entry)
  const canRequest = entry.allowedActions.includes('REQUEST_TO_JOIN')
  return (
    <div className="mt-auto space-y-3">
      {state === 'pending' && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-status-warning">
          <Clock aria-hidden className="size-4" />
          Đang chờ ban chủ nhiệm duyệt
        </p>
      )}
      {state === 'rejected' && (
        <p className="rounded-xl bg-status-danger-soft p-3 text-sm text-status-danger">
          Yêu cầu trước bị từ chối{entry.myMembership?.rejectionReason ? `: ${entry.myMembership.rejectionReason}` : '.'}
        </p>
      )}
      {state === 'former' && <p className="text-sm text-muted-foreground">Bạn từng là thành viên CLB này.</p>}
      {state === 'member' ? (
        <Button variant="secondary" className="w-full" onClick={onEnter}>
          Vào CLB
          <ArrowRight aria-hidden />
        </Button>
      ) : (
        canRequest && (
          <Button className="w-full" onClick={onJoin}>
            <UserPlus aria-hidden />
            {state === 'rejected' || state === 'former' ? 'Gửi lại yêu cầu' : 'Xin gia nhập'}
          </Button>
        )
      )}
    </div>
  )
}

/** Tìm CLB và gửi yêu cầu gia nhập (FR-MEM-02); chỉ hiện thông tin công khai (SRS 3.5). */
export function ClubDirectoryPage() {
  const vm = useClubDirectoryViewModel()

  return (
    <div>
      <PageHeader title="Tìm CLB" description="Các CLB, đội, nhóm đang hoạt động. Gửi yêu cầu để ban chủ nhiệm duyệt bạn vào CLB." />
      <SearchInput label="Tìm CLB" placeholder="Tìm theo tên, lĩnh vực…" value={vm.keyword} onValueChange={vm.setKeyword} className="mb-5 sm:max-w-md" />

      {vm.loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải danh sách CLB">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-64 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.clubs.length === 0 && (
        <EmptyState icon={SearchX} title="Không có CLB phù hợp" description={vm.keyword ? 'Thử tìm theo tên viết tắt hoặc lĩnh vực khác.' : 'Chưa có CLB nào đang hoạt động.'} />
      )}
      {!vm.error && vm.clubs.length > 0 && (
        <motion.ul key={vm.page} variants={listVariants} initial="initial" animate="animate" className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vm.clubs.map((entry) => (
            <motion.li key={entry.id} variants={itemVariants} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <ClubMonogram clubId={entry.id} shortName={entry.shortName} logoUrl={entry.logoUrl} />
                <div className="min-w-0">
                  <h2 className="font-bold">{entry.name}</h2>
                  <Badge tone="neutral" className="mt-1">
                    {entry.field}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{entry.description}</p>
              <ClubContactList contacts={entry} />
              <ClubStatus entry={entry} onJoin={() => vm.openJoin(entry)} onEnter={() => vm.enterClub(entry.id)} />
            </motion.li>
          ))}
        </motion.ul>
      )}
      {!vm.error && (
        <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
      )}

      <JoinRequestDialog target={vm.joinTarget} onClose={vm.closeJoin} />
    </div>
  )
}

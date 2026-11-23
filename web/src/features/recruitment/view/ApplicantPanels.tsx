import { ArrowRight, FileText, UserPlus } from 'lucide-react'
import { Link } from 'react-router'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { useMyApplicationsViewModel, useOpenRecruitmentsViewModel } from '../viewModel/useApplicationViewModels'
import { MyApplicationCard, WithdrawDialog } from './MyApplicationCard'

const applyPath = (recruitmentId: string) => `/recruitments/${encodeURIComponent(recruitmentId)}`

/** FR-REC-02: đợt tuyển đang nhận đơn ở mọi CLB. */
export function OpenRecruitmentsPanel({ active }: { active: boolean }) {
  const vm = useOpenRecruitmentsViewModel(active)
  return (
    <div className="space-y-4">
      <SearchInput label="Tìm đợt tuyển" placeholder="Tìm theo tên đợt hoặc CLB…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-md" />
      {vm.loading ? (
        <Skeleton role="status" aria-label="Đang tải đợt tuyển" className="h-40 rounded-2xl" />
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={UserPlus} title="Chưa có đợt tuyển nào đang nhận đơn" />
      ) : (
        <>
          <ul aria-label="Đợt tuyển đang mở" className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {vm.rows.map((row) => (
              <li key={row.id}>
                <Link to={applyPath(row.id)} className="flex h-full flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-colors duration-200 hover:border-primary/40">
                  <span className="text-xs font-semibold text-muted-foreground">{row.club.name}</span>
                  <span className="font-semibold [overflow-wrap:anywhere]">{row.name}</span>
                  <span className="text-sm text-muted-foreground">Hạn nộp {formatDateTime(row.closesAt)}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {row.departments.map((department) => (
                      <Badge key={department.id} tone="neutral">
                        {department.name}: {department.quota}
                      </Badge>
                    ))}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Xem và nộp đơn
                    <ArrowRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </>
      )}
    </div>
  )
}

/** FR-REC-02: đơn của tôi ở mọi đợt tuyển, rút được khi đợt còn nhận đơn. */
export function MyApplicationsPanel({ active }: { active: boolean }) {
  const vm = useMyApplicationsViewModel(active)
  return (
    <div>
      {vm.loading ? (
        <Skeleton role="status" aria-label="Đang tải đơn của tôi" className="h-40 rounded-2xl" />
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={FileText} title="Bạn chưa nộp đơn nào" description="Xem các đợt đang nhận đơn ở tab Đợt tuyển đang mở." />
      ) : (
        <ul aria-label="Đơn của tôi" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {vm.rows.map((application) => (
            <li key={application.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
              <MyApplicationCard application={application} vm={vm} showRecruitment />
              <Link to={applyPath(application.recruitment.id)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Xem đợt tuyển
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <WithdrawDialog vm={vm} />
    </div>
  )
}

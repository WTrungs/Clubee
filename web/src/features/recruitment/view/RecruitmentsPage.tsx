import { ArrowRight, Plus, UserPlus } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Pagination } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { recruitmentPeriod, recruitmentStatusDisplay } from '../viewModel/recruitmentDisplay'
import { useRecruitmentsViewModel } from '../viewModel/useRecruitmentViewModels'
import { RecruitmentFormSheet } from './RecruitmentFormSheet'

/** FR-REC-01: danh sách đợt tuyển của CLB; ban chủ nhiệm mở đợt mới. */
export function RecruitmentsPage() {
  const vm = useRecruitmentsViewModel()
  return (
    <div>
      <PageHeader
        eyebrow={vm.clubName}
        title="Tuyển thành viên"
        description="Các đợt tuyển của CLB: thời gian nhận đơn, chỉ tiêu theo ban và các vòng."
        actions={
          vm.canManage && (
            <Button onClick={vm.openForm}>
              <Plus aria-hidden />
              Mở đợt tuyển
            </Button>
          )
        }
      />
      {!vm.canManage ? (
        <EmptyState icon={UserPlus} title="Chỉ ban chủ nhiệm quản lý đợt tuyển" />
      ) : vm.loading ? (
        <Skeleton role="status" aria-label="Đang tải đợt tuyển" className="h-48 rounded-2xl" />
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={UserPlus} title="Chưa có đợt tuyển nào" description="Bấm Mở đợt tuyển để khai báo đợt đầu tiên." />
      ) : (
        <>
          <ul aria-label="Đợt tuyển" className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {vm.rows.map((row) => {
              const status = recruitmentStatusDisplay[row.status]
              return (
                <li key={row.id}>
                  <Link
                    to={vm.detailPath(row.id)}
                    className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors duration-200 hover:border-primary/40"
                  >
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{row.name}</span>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </span>
                    <span className="text-sm text-muted-foreground">{recruitmentPeriod(row)}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 text-sm">
                      <span>
                        Chỉ tiêu {row.quotaTotal} · {row.roundCount} vòng · {row.applicationCount} đơn
                      </span>
                      <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </>
      )}
      {vm.canManage && <RecruitmentFormSheet open={vm.formOpen} editing={null} onClose={vm.closeForm} />}
    </div>
  )
}

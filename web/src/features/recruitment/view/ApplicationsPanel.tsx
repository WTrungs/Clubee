import { Inbox } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { ApplicationStatus, RecruitmentDetail } from '../model/recruitmentTypes'
import { applicationStatusDisplay, choicesText } from '../viewModel/recruitmentDisplay'
import { useApplicationsViewModel, type ApplicationsViewModel } from '../viewModel/useApplicationViewModels'

const STATUS_FILTERS = Object.keys(applicationStatusDisplay) as ApplicationStatus[]

function ApplicationDetailSheet({ vm }: { vm: ApplicationsViewModel }) {
  const detail = vm.detail
  return (
    <Sheet open={vm.detailId !== null} onOpenChange={(open) => !open && vm.closeDetail()}>
      <SheetContent title={detail?.applicant.fullName ?? 'Đơn ứng tuyển'} description={detail ? `Nộp lúc ${formatDateTime(detail.submittedAt)}` : undefined}>
        <div className="space-y-5 p-5">
          {vm.detailLoading && <Skeleton role="status" aria-label="Đang tải đơn" className="h-40 rounded-2xl" />}
          {vm.detailError && <ErrorState error={vm.detailError} />}
          {detail && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={applicationStatusDisplay[detail.status].tone} dot>
                  {applicationStatusDisplay[detail.status].label}
                </Badge>
                {detail.studentId && <span className="text-sm text-muted-foreground">MSSV {detail.studentId}</span>}
              </div>
              <p className="text-sm">
                <span className="font-semibold">Nguyện vọng:</span> {choicesText(detail.choices)}
              </p>
              {detail.roundResults.length > 0 && (
                <section aria-label="Kết quả từng vòng" className="space-y-2">
                  <h3 className="text-sm font-bold">Kết quả từng vòng · tổng điểm {detail.totalScore}</h3>
                  <ol className="space-y-2">
                    {detail.roundResults.map((result) => (
                      <li key={result.roundId} className="rounded-xl bg-muted/60 p-3 text-sm">
                        <p className="font-semibold">
                          {result.roundName}: {result.result === 'PASS' ? `Đạt · ${result.score ?? 0} điểm` : 'Loại'}
                        </p>
                        {result.note && <p className="text-muted-foreground [overflow-wrap:anywhere]">{result.note}</p>}
                        <p className="text-xs text-muted-foreground">
                          {result.by.fullName} · {formatDateTime(result.at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {detail.answers.length > 0 && (
                <dl className="space-y-3">
                  {detail.answers.map((answer) => (
                    <div key={answer.questionId} className="space-y-1">
                      <dt className="text-sm font-semibold">{answer.question}</dt>
                      <dd className="text-sm whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{answer.text || 'Không trả lời'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {detail.withdrawnAt && <p className="text-xs text-muted-foreground">Rút đơn lúc {formatDateTime(detail.withdrawnAt)}</p>}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** FR-REC-02: đơn của đợt, chỉ ban chủ nhiệm xem (SRS 3.5). */
export function ApplicationsPanel({ clubId, recruitment, active }: { clubId: string; recruitment: RecruitmentDetail; active: boolean }) {
  const vm = useApplicationsViewModel(clubId, recruitment, active)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <SearchInput label="Tìm ứng viên" placeholder="Tìm theo tên ứng viên…" value={vm.keyword} onValueChange={vm.setKeyword} />
        <NativeSelect aria-label="Lọc theo trạng thái" value={vm.status} onChange={(event) => vm.setStatus(event.target.value as ApplicationStatus | '')}>
          <option value="">Mọi trạng thái</option>
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {applicationStatusDisplay[status].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo nguyện vọng" value={vm.departmentId} onChange={(event) => vm.setDepartmentId(event.target.value)}>
          <option value="">Mọi ban</option>
          {vm.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {vm.loading ? (
        <Skeleton role="status" aria-label="Đang tải đơn ứng tuyển" className="h-40 rounded-2xl" />
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Không có đơn nào phù hợp" />
      ) : (
        <>
          <ul aria-label="Đơn ứng tuyển" className="divide-y rounded-2xl border bg-card shadow-sm">
            {vm.rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => vm.openDetail(row.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/60">
                  <span className="min-w-0">
                    <span className="block font-semibold">{row.applicant.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {choicesText(row.choices)} · {formatDate(row.submittedAt)}
                    </span>
                  </span>
                  <Badge tone={applicationStatusDisplay[row.status].tone} dot>
                    {applicationStatusDisplay[row.status].label}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </>
      )}
      <ApplicationDetailSheet vm={vm} />
    </div>
  )
}

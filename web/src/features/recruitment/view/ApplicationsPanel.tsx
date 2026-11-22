import { History, Inbox } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { ApplicantHistory, ApplicationStatus, RecruitmentDetail } from '../model/recruitmentTypes'
import { applicationStatusDisplay, choicesText, priorExitText, priorHistoryText } from '../viewModel/recruitmentDisplay'
import { useApplicationsViewModel, type ApplicationsViewModel } from '../viewModel/useApplicationViewModels'

const STATUS_FILTERS = Object.keys(applicationStatusDisplay) as ApplicationStatus[]

/** FR-REC-04: đơn cũ, điểm cũ, lý do bị loại và tư cách cũ của ứng viên ở CLB này. */
function ApplicantHistorySection({ history }: { history: ApplicantHistory }) {
  if (history.applications.length === 0 && history.memberships.length === 0) return null
  return (
    <section aria-labelledby="applicant-history" className="space-y-2 rounded-xl border border-status-warning/40 bg-status-warning-soft p-3">
      <h3 id="applicant-history" className="flex items-center gap-2 text-sm font-bold text-status-warning">
        <History aria-hidden className="size-4" />
        Lịch sử ở CLB
      </h3>
      <ul className="space-y-2 text-sm">
        {history.applications.map((application) => (
          <li key={application.id} className="rounded-lg bg-card p-3">
            <p className="font-semibold [overflow-wrap:anywhere]">{application.recruitment.name}</p>
            <p className="text-xs text-muted-foreground">
              Nộp {formatDate(application.submittedAt)} · {applicationStatusDisplay[application.status].label}
              {application.outcome?.departmentName ? ` · Ban ${application.outcome.departmentName}` : ''} · tổng điểm {application.totalScore}
            </p>
            {application.roundResults.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {application.roundResults.map((result) => (
                  <li key={result.roundName} className="[overflow-wrap:anywhere]">
                    {result.roundName}: {result.result === 'PASS' ? `Đạt · ${result.score ?? 0} điểm` : `Loại · ${result.note}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {history.memberships.map((membership, index) => (
          <li key={`${membership.leftOn ?? ''}-${index}`} className="rounded-lg bg-card p-3">
            <p className="font-semibold">{priorExitText[membership.exitKind]}</p>
            <p className="text-xs text-muted-foreground">
              {membership.joinedOn ? `Thành viên từ ${formatDate(membership.joinedOn)}` : 'Chưa được duyệt vào CLB'}
              {membership.leftOn ? ` đến ${formatDate(membership.leftOn)}` : ''}
            </p>
            {membership.reason && <p className="[overflow-wrap:anywhere]">Lý do: {membership.reason}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

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
              <ApplicantHistorySection history={detail.history} />
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
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {row.applicant.fullName}
                      {row.priorHistory && (
                        <Badge tone="warning" title={priorHistoryText(row.priorHistory)}>
                          Ứng viên cũ
                        </Badge>
                      )}
                    </span>
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

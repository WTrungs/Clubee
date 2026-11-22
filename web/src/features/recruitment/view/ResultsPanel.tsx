import { Gavel, Info, Trophy } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { RESPONSE_DAYS_MAX } from '@/shared/lib/recruitmentRules'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { Pagination } from '@/shared/ui/ListControls'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { FinalDecision, RecruitmentDetail } from '../model/recruitmentTypes'
import { applicationStatusDisplay, choicesText, finalDecisionLabel } from '../viewModel/recruitmentDisplay'
import { useResultGroupViewModel, useResultsViewModel, type ResultsViewModel } from '../viewModel/useResultsViewModel'

const DECISIONS: FinalDecision[] = ['ADMITTED', 'RESERVE', 'NOT_ADMITTED']

function QuotaBar({ vm }: { vm: ResultsViewModel }) {
  return (
    <ul aria-label="Chỉ tiêu theo ban" className="flex flex-wrap gap-2">
      {vm.usage.map((usage) => (
        <li key={usage.departmentId}>
          <Badge tone={usage.over ? 'danger' : usage.admitted === usage.quota ? 'success' : 'neutral'}>
            {usage.departmentName}: {usage.admitted}/{usage.quota}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function FinalizeSheet({ vm }: { vm: ResultsViewModel }) {
  return (
    <Sheet open={vm.editing} onOpenChange={(open) => !open && vm.cancel()}>
      <SheetContent
        title="Chốt kết quả"
        description="Đề xuất xếp theo tổng điểm và nguyện vọng; sửa từng dòng nếu cần. Chốt xong hệ thống báo kết quả cho từng ứng viên."
        footer={
          <>
            <Button variant="ghost" onClick={vm.cancel} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button onClick={vm.submit} loading={vm.pending}>
              Chốt kết quả
            </Button>
          </>
        }
      >
        <div className="space-y-5 p-5">
          <QuotaBar vm={vm} />
          {vm.sections.map((section) => (
            <section key={section.key} aria-label={section.title} className="space-y-2">
              <h3 className="text-sm font-bold">
                {section.title} ({section.rows.length})
              </h3>
              {section.rows.length === 0 && <p className="text-sm text-muted-foreground">Chưa có ai.</p>}
              <ol className="space-y-3">
                {section.rows.map((row) => {
                  const draft = vm.draftOf(row.application.id)
                  if (!draft) return null
                  const eligible = row.rank !== null
                  return (
                    <li key={row.application.id} className="space-y-3 rounded-xl border p-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {row.rank !== null && <span className="mr-1 text-muted-foreground">#{row.rank}</span>}
                          {row.application.applicant.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {choicesText(row.application.choices)} · tổng điểm {row.application.totalScore}
                          {!eligible && ' · chưa đạt mọi vòng'}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <FormField label="Kết quả">
                          <NativeSelect
                            value={draft.decision}
                            disabled={!eligible}
                            onChange={(event) => {
                              const decision = event.target.value as FinalDecision
                              vm.update(row.application.id, { decision, departmentId: decision === 'NOT_ADMITTED' ? null : (draft.departmentId ?? row.application.choices[0]?.departmentId ?? null) })
                            }}
                          >
                            {DECISIONS.map((decision) => (
                              <option key={decision} value={decision}>
                                {finalDecisionLabel[decision]}
                              </option>
                            ))}
                          </NativeSelect>
                        </FormField>
                        {draft.decision !== 'NOT_ADMITTED' && (
                          <FormField label="Ban">
                            <NativeSelect value={draft.departmentId ?? ''} onChange={(event) => vm.update(row.application.id, { departmentId: event.target.value })}>
                              {row.application.choices.map((choice) => (
                                <option key={choice.departmentId} value={choice.departmentId}>
                                  {choice.departmentName}
                                </option>
                              ))}
                            </NativeSelect>
                          </FormField>
                        )}
                        {draft.decision === 'RESERVE' && (
                          <FormField label="Thứ tự dự bị">
                            <Input inputMode="numeric" maxLength={3} value={draft.reserveOrder} onChange={(event) => vm.update(row.application.id, { reserveOrder: event.target.value })} />
                          </FormField>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
          <FormField label="Số ngày được nhận kết quả" required hint={`Người trúng tuyển nhận hoặc từ chối trong số ngày này (tối đa ${RESPONSE_DAYS_MAX}).`}>
            <Input inputMode="numeric" maxLength={2} value={vm.days} onChange={(event) => vm.setDays(event.target.value)} className="sm:max-w-32" />
          </FormField>
          <FormAlert message={vm.problems.length > 0 ? vm.problems.join(' ') : vm.serverError} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ResultGroup({ clubId, recruitmentId, outcome, title }: { clubId: string; recruitmentId: string; outcome: FinalDecision; title: string }) {
  const vm = useResultGroupViewModel(clubId, recruitmentId, outcome, true)
  if (vm.loading) return <Skeleton role="status" aria-label={`Đang tải nhóm ${title}`} className="h-24 rounded-2xl" />
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  if (vm.totalElements === 0) return null
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-bold">
        {title} ({vm.totalElements})
      </h3>
      <ul className="divide-y rounded-2xl border bg-card shadow-sm">
        {vm.rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="min-w-0">
              <span className="block font-semibold">{row.applicant.fullName}</span>
              <span className="block text-xs text-muted-foreground">
                {outcome === 'NOT_ADMITTED'
                  ? `${choicesText(row.choices)} · tổng điểm ${row.totalScore}`
                  : outcome === 'RESERVE'
                    ? `Ban ${row.outcome?.departmentName ?? ''} · thứ tự ${row.outcome?.reserveOrder ?? ''}`
                    : `Ban ${row.outcome?.departmentName ?? ''}${row.outcome?.respondBy ? ` · hạn nhận ${formatDateTime(row.outcome.respondBy)}` : ''}`}
              </span>
            </span>
            <Badge tone={applicationStatusDisplay[row.status].tone} dot>
              {applicationStatusDisplay[row.status].label}
            </Badge>
          </li>
        ))}
      </ul>
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
    </section>
  )
}

function FinalizedResults({ clubId, recruitmentId }: { clubId: string; recruitmentId: string }) {
  return (
    <div className="space-y-5">
      <ResultGroup clubId={clubId} recruitmentId={recruitmentId} outcome="ADMITTED" title="Trúng tuyển" />
      <ResultGroup clubId={clubId} recruitmentId={recruitmentId} outcome="RESERVE" title="Dự bị" />
      <ResultGroup clubId={clubId} recruitmentId={recruitmentId} outcome="NOT_ADMITTED" title="Không trúng tuyển" />
    </div>
  )
}

/** FR-REC-07: chốt kết quả theo đề xuất, xem bảng kết quả sau khi chốt. */
export function ResultsPanel({ clubId, recruitment, active }: { clubId: string; recruitment: RecruitmentDetail; active: boolean }) {
  const vm = useResultsViewModel(clubId, recruitment, active)
  if (vm.loading) return <Skeleton role="status" aria-label="Đang tải kết quả" className="h-40 rounded-2xl" />
  if (vm.error) return <ErrorState error={vm.error} onRetry={vm.refetch} />
  if (vm.finalized) return <FinalizedResults clubId={clubId} recruitmentId={recruitment.id} />
  return (
    <div className="space-y-4">
      {!vm.canFinalize && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          Chốt kết quả được sau giờ đóng nhận đơn. Bên dưới là đề xuất theo số liệu hiện tại.
        </p>
      )}
      {vm.blockers.length > 0 && (
        <ul role="status" className="space-y-1 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
          {vm.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      <QuotaBar vm={vm} />
      {vm.rows.length === 0 ? (
        <EmptyState icon={Trophy} title="Chưa có đơn nào để xếp hạng" />
      ) : (
        vm.sections.map((section) => (
          <section key={section.key} aria-label={`Đề xuất ${section.title}`} className="space-y-2">
            <h3 className="text-sm font-bold">
              {section.title} ({section.rows.length})
            </h3>
            {section.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có ai.</p>
            ) : (
              <ol className="divide-y rounded-2xl border bg-card shadow-sm">
                {section.rows.map((row) => (
                  <li key={row.application.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {row.rank !== null && <span className="mr-1 text-muted-foreground">#{row.rank}</span>}
                        {row.application.applicant.fullName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {choicesText(row.application.choices)} · tổng điểm {row.application.totalScore}
                      </span>
                    </span>
                    <Badge tone={row.decision === 'ADMITTED' ? 'success' : row.decision === 'RESERVE' ? 'warning' : 'neutral'}>
                      {finalDecisionLabel[row.decision]}
                      {row.reserveOrder !== null && ` #${row.reserveOrder}`}
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))
      )}
      {vm.canFinalize && (
        <Button className="w-full sm:w-auto" disabled={vm.blockers.length > 0} onClick={vm.start}>
          <Gavel aria-hidden />
          Chốt kết quả
        </Button>
      )}
      <FinalizeSheet vm={vm} />
    </div>
  )
}

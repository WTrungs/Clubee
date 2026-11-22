import { CircleCheck, CircleX, ListFilter, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { ROUND_NOTE_MAX, ROUND_SCORE_MAX, ROUND_SCORE_MIN } from '@/shared/lib/recruitmentRules'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { FilterChip, Pagination } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { RecruitmentDetail, RoundResultValue } from '../model/recruitmentTypes'
import { choicesText } from '../viewModel/recruitmentDisplay'
import { parseScore, useRoundReviewViewModel, type ReviewTarget, type RoundReviewViewModel } from '../viewModel/useRoundReviewViewModel'

function ReviewForm({ target, vm }: { target: ReviewTarget; vm: RoundReviewViewModel }) {
  const formId = useId()
  const previous = target.application.roundResults.find((result) => result.roundId === target.roundId) ?? null
  const [result, setResult] = useState<RoundResultValue>(target.result)
  const [score, setScore] = useState(previous?.score !== null && previous?.score !== undefined ? String(previous.score) : '')
  const [note, setNote] = useState(previous?.note ?? '')
  const [touched, setTouched] = useState(false)
  const parsed = parseScore(score)
  const trimmed = note.trim()
  const scoreError = touched && result === 'PASS' && parsed === null ? `Nhập điểm nguyên từ ${ROUND_SCORE_MIN} đến ${ROUND_SCORE_MAX}.` : undefined
  const noteError =
    touched && result === 'FAIL' && trimmed.length < REASON_MIN
      ? `Nhận xét cần ít nhất ${REASON_MIN} ký tự.`
      : touched && result === 'FAIL' && trimmed.length > REASON_MAX
        ? `Nhận xét khi Loại tối đa ${REASON_MAX} ký tự.`
        : undefined

  return (
    <DialogContent
      title={`Xét vòng: ${target.application.applicant.fullName}`}
      description={`${target.roundName} · nguyện vọng ${choicesText(target.application.choices)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={vm.close} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} variant={result === 'FAIL' ? 'destructive' : 'primary'} loading={vm.pending}>
            {result === 'PASS' ? 'Ghi Đạt' : 'Ghi Loại'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setTouched(true)
          if (result === 'PASS' && parsed !== null) vm.submit('PASS', parsed, trimmed)
          if (result === 'FAIL' && trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX) vm.submit('FAIL', null, trimmed)
        }}
      >
        <div role="radiogroup" aria-label="Kết quả" className="grid grid-cols-2 gap-2">
          {(['PASS', 'FAIL'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={result === option}
              onClick={() => setResult(option)}
              className={cn(
                'h-11 rounded-lg border text-sm font-semibold transition-colors duration-150',
                result === option ? (option === 'PASS' ? 'border-transparent bg-status-success-soft text-status-success' : 'border-transparent bg-status-danger-soft text-status-danger') : 'bg-card text-muted-foreground',
              )}
            >
              {option === 'PASS' ? 'Đạt' : 'Loại'}
            </button>
          ))}
        </div>
        {result === 'PASS' && (
          <FormField label={`Điểm (${ROUND_SCORE_MIN}–${ROUND_SCORE_MAX})`} required error={scoreError}>
            <Input inputMode="numeric" maxLength={3} value={score} onChange={(event) => setScore(event.target.value)} />
          </FormField>
        )}
        <FormField label="Nhận xét" required={result === 'FAIL'} error={noteError}>
          <Textarea value={note} maxLength={result === 'FAIL' ? REASON_MAX : ROUND_NOTE_MAX} onChange={(event) => setNote(event.target.value)} />
        </FormField>
        <FormAlert message={vm.dialogError} />
      </form>
    </DialogContent>
  )
}

/** FR-REC-03: lọc đơn theo vòng, ban chủ nhiệm đánh dấu Đạt (kèm điểm) hoặc Loại (kèm nhận xét). */
export function RoundReviewPanel({ clubId, recruitment, active }: { clubId: string; recruitment: RecruitmentDetail; active: boolean }) {
  const vm = useRoundReviewViewModel(clubId, recruitment, active)
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Chọn vòng" className="flex flex-wrap gap-2">
        {vm.rounds.map((round) => (
          <FilterChip key={round.id} label={round.label} count={round.pending} selected={vm.roundId === round.id} onToggle={() => vm.setRoundId(round.id)} />
        ))}
      </div>
      <div role="group" aria-label="Lọc theo kết quả vòng" className="flex flex-wrap gap-2">
        {vm.states.map((state) => (
          <FilterChip key={state.value} label={state.label} count={state.count} selected={vm.roundState === state.value} onToggle={() => vm.setRoundState(state.value)} />
        ))}
      </div>
      {!vm.canReview && <p className="text-sm text-muted-foreground">Đợt tuyển đã chốt kết quả nên không sửa kết quả vòng được nữa.</p>}
      {vm.loading ? (
        <Skeleton role="status" aria-label="Đang tải đơn theo vòng" className="h-40 rounded-2xl" />
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={ListFilter} title="Không có đơn nào ở bộ lọc này" />
      ) : (
        <>
          <ul aria-label="Đơn theo vòng" className="divide-y rounded-2xl border bg-card shadow-sm">
            {vm.rows.map((application) => {
              const result = vm.resultOf(application)
              const actions = vm.actionsOf(application)
              return (
                <li key={application.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{application.applicant.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {choicesText(application.choices)} · tổng điểm {application.totalScore}
                    </p>
                    {result && (
                      <p className="text-sm [overflow-wrap:anywhere]">
                        <Badge tone={result.result === 'PASS' ? 'success' : 'danger'}>{result.result === 'PASS' ? `Đạt · ${result.score ?? 0} điểm` : 'Loại'}</Badge>
                        {result.note && <span className="ml-2 text-muted-foreground">{result.note}</span>}
                      </p>
                    )}
                  </div>
                  {actions.length > 0 && (
                    <div className="flex shrink-0 gap-2">
                      {actions.includes('PASS') && (
                        <Button size="sm" onClick={() => vm.open(application, 'PASS')} aria-label={`Đạt: ${application.applicant.fullName}`}>
                          <CircleCheck aria-hidden />
                          Đạt
                        </Button>
                      )}
                      {actions.includes('FAIL') && (
                        <Button size="sm" variant="outline" onClick={() => vm.open(application, 'FAIL')} aria-label={`Loại: ${application.applicant.fullName}`}>
                          <CircleX aria-hidden />
                          Loại
                        </Button>
                      )}
                      {actions.includes('EDIT') && result && (
                        <Button size="sm" variant="outline" onClick={() => vm.open(application, result.result)} aria-label={`Sửa kết quả: ${application.applicant.fullName}`}>
                          <Pencil aria-hidden />
                          Sửa kết quả
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </>
      )}
      <Dialog open={vm.target !== null} onOpenChange={(open) => !open && vm.close()}>
        {vm.target && <ReviewForm key={`${vm.target.application.id}-${vm.target.result}`} target={vm.target} vm={vm} />}
      </Dialog>
    </div>
  )
}

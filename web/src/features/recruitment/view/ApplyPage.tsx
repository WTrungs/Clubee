import { ArrowLeft, Info, Send } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { APPLICATION_ANSWER_MAX } from '@/shared/lib/recruitmentRules'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { PublicRecruitment } from '../model/recruitmentTypes'
import { recruitmentPeriod, recruitmentStatusDisplay } from '../viewModel/recruitmentDisplay'
import { useApplicationFormViewModel, useApplyViewModel } from '../viewModel/useApplicationViewModels'
import { MyApplicationCard, WithdrawDialog } from './MyApplicationCard'

function ApplyForm({ recruitment }: { recruitment: PublicRecruitment }) {
  const formId = useId()
  const vm = useApplicationFormViewModel(recruitment)
  const { register, formState } = vm.form
  const errors = formState.errors
  return (
    <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">Nộp đơn</h2>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Nguyện vọng ban</legend>
        <p className="text-xs text-muted-foreground">Chọn tối đa 3 ban theo thứ tự ưu tiên; ban chủ nhiệm xếp bạn vào nguyện vọng đầu tiên còn chỉ tiêu.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <FormField key={index} label={`Nguyện vọng ${index + 1}`} required={index === 0} error={errors.choices?.[index]?.message}>
              <NativeSelect {...register(`choices.${index}`)}>
                <option value="">{index === 0 ? 'Chọn ban' : 'Không chọn'}</option>
                {recruitment.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ))}
        </div>
      </fieldset>
      {recruitment.questions.map((question, index) => (
        <FormField key={question.id} label={question.text} required={question.required} error={errors.answers?.[index]?.message}>
          <Textarea maxLength={APPLICATION_ANSWER_MAX} {...register(`answers.${index}`)} />
        </FormField>
      ))}
      {recruitment.collectsStudentId && (
        <FormField label="MSSV" required error={errors.studentId?.message} hint="CLB này thu thập MSSV của thành viên.">
          <Input inputMode="text" maxLength={20} {...register('studentId')} />
        </FormField>
      )}
      <FormAlert message={vm.errorMessage} />
      <Button type="submit" loading={vm.pending} className="w-full sm:w-auto">
        <Send aria-hidden />
        Nộp đơn
      </Button>
    </form>
  )
}

/** FR-REC-02: trang đợt tuyển phía ứng viên; cần đăng nhập. */
export function ApplyPage() {
  const vm = useApplyViewModel()
  const recruitment = vm.recruitment
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/directory?tab=recruitments" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Đợt tuyển đang mở
      </Link>
      <PageHeader
        eyebrow={recruitment?.club.name}
        title={recruitment?.name ?? 'Đợt tuyển'}
        description={recruitment ? `Nhận đơn ${recruitmentPeriod(recruitment)}` : undefined}
        actions={
          recruitment && (
            <Badge tone={recruitmentStatusDisplay[recruitment.status].tone} dot>
              {recruitmentStatusDisplay[recruitment.status].label}
            </Badge>
          )
        }
      />
      {vm.loading && <Skeleton role="status" aria-label="Đang tải đợt tuyển" className="h-64 rounded-2xl" />}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {recruitment && (
        <div className="space-y-5">
          <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
            {recruitment.description && <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">{recruitment.description}</p>}
            <ul aria-label="Chỉ tiêu theo ban" className="flex flex-wrap gap-2">
              {recruitment.departments.map((department) => (
                <li key={department.id}>
                  <Badge tone="neutral">
                    Ban {department.name}: {department.quota} người
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
          {recruitment.myApplication ? (
            <section aria-label="Đơn của bạn" className="rounded-2xl border bg-card p-5 shadow-sm">
              <MyApplicationCard application={recruitment.myApplication} vm={vm} />
            </section>
          ) : recruitment.applyBlocker ? (
            <p role="status" className="flex items-start gap-2 rounded-2xl bg-muted p-4 text-sm">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {recruitment.applyBlocker}
            </p>
          ) : (
            <ApplyForm recruitment={recruitment} />
          )}
        </div>
      )}
      <WithdrawDialog vm={vm} />
    </div>
  )
}

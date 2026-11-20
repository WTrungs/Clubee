import { useId } from 'react'
import { formatLongDate } from '@/shared/format/formatDate'
import { SERIES_MAX_SESSIONS } from '@/shared/lib/sessionRecurrence'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { SessionScopeOption } from '../model/sessionTypes'
import { scopeKeyOf } from '../viewModel/sessionFormSchema'
import { useSessionFormViewModel } from '../viewModel/useSessionFormViewModel'
import { SessionFormFields } from './SessionFormFields'

interface SessionFormSheetProps {
  clubId: string
  clubName: string
  scopes: SessionScopeOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionFormSheet({ clubId, clubName, scopes, open, onOpenChange }: SessionFormSheetProps) {
  const formId = useId()
  const vm = useSessionFormViewModel(clubId, scopes, () => onOpenChange(false))
  const { register, formState } = vm.form
  const errors = formState.errors
  const close = () => {
    vm.reset()
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (vm.pending) return
        if (!next) vm.reset()
        onOpenChange(next)
      }}
    >
      <SheetContent
        title="Tạo buổi sinh hoạt"
        description={`CLB hiện hành: ${clubName}. Thành viên trong phạm vi được báo ngay khi tạo buổi.`}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending} disabled={!vm.canSubmit}>
              {vm.repeat === 'NONE' ? 'Tạo buổi' : vm.seriesDays.length > 1 && !vm.seriesTooLong ? `Tạo ${vm.seriesDays.length} buổi` : 'Tạo chuỗi buổi'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
          <FormField label="Phạm vi" required error={errors.scopeKey?.message} hint="Buổi toàn CLB báo mọi thành viên; buổi của ban báo thành viên có ban chính là ban đó.">
            <NativeSelect disabled={!vm.canSubmit} {...register('scopeKey')}>
              {!vm.canSubmit && <option value="">Bạn không còn phạm vi nào để tạo buổi</option>}
              {vm.canSubmit && vm.scopeKey === '' && (
                <option value="" disabled>
                  Chọn phạm vi…
                </option>
              )}
              {vm.scopes.map((scope) => (
                <option key={scopeKeyOf(scope)} value={scopeKeyOf(scope)}>
                  {scope.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <SessionFormFields form={vm.form} />

          <fieldset className="space-y-4 rounded-2xl border p-4">
            <legend className="px-1 text-sm font-semibold">Chuỗi buổi</legend>
            <FormField label="Lặp lại" hint="Mỗi buổi giữ giờ, độ dài và hạn đăng ký như buổi đầu; sau này sửa hay hủy từng buổi riêng.">
              <NativeSelect {...register('repeat')}>
                <option value="NONE">Không lặp</option>
                <option value="WEEKLY">Hằng tuần</option>
                <option value="MONTHLY">Hằng tháng</option>
              </NativeSelect>
            </FormField>
            {vm.repeat !== 'NONE' && (
              <>
                <FormField label="Đến ngày" required error={errors.untilDate?.message} hint={`Tối đa ${SERIES_MAX_SESSIONS} buổi, trong vòng một năm.`}>
                  <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('untilDate')} />
                </FormField>
                {vm.seriesDays.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">
                      {vm.seriesTooLong ? `Hơn ${SERIES_MAX_SESSIONS} buổi, vượt giới hạn của một chuỗi` : `${vm.seriesDays.length} buổi`}
                    </p>
                    <ol aria-label="Ngày các buổi trong chuỗi" className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                      {vm.seriesDays.map((day, index) => (
                        <li key={day} className="rounded-lg bg-muted px-2 py-1 text-xs font-medium tabular-nums">
                          <span className="sr-only">Buổi {index + 1}: </span>
                          {formatLongDate(`${day}T12:00:00+07:00`)}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </fieldset>

          <FormAlert message={vm.errorMessage} />
        </form>
      </SheetContent>
    </Sheet>
  )
}

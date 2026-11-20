import { useId } from 'react'
import { Button } from '@/shared/ui/Button'
import { DateTimeRow } from '@/shared/ui/DateTimeRow'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import type { SessionScopeOption } from '../model/sessionTypes'
import { scopeKeyOf } from '../viewModel/sessionFormSchema'
import { useSessionFormViewModel } from '../viewModel/useSessionFormViewModel'

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
              Tạo buổi
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
          <FormField label="Tên buổi" required error={errors.title?.message}>
            <Input placeholder="Ví dụ: Sinh hoạt định kỳ tuần 3" maxLength={150} {...register('title')} />
          </FormField>
          <FormField label="Nội dung" error={errors.description?.message}>
            <Textarea placeholder="Chủ đề, cần chuẩn bị gì…" maxLength={3000} {...register('description')} />
          </FormField>

          <DateTimeRow label="Bắt đầu" date={register('startDate')} time={register('startTime')} error={errors.startDate?.message ?? errors.startTime?.message} />
          <DateTimeRow label="Kết thúc" date={register('endDate')} time={register('endTime')} error={errors.endDate?.message ?? errors.endTime?.message} />

          <FormField label="Địa điểm" required error={errors.location?.message}>
            <Input placeholder="Ví dụ: Phòng B4.12" maxLength={200} {...register('location')} />
          </FormField>
          <FormField label="Số chỗ" error={errors.capacity?.message} hint="Để trống nếu không giới hạn.">
            <Input inputMode="numeric" placeholder="Không giới hạn" maxLength={5} {...register('capacity')} />
          </FormField>
          <DateTimeRow label="Hạn đăng ký" date={register('deadlineDate')} time={register('deadlineTime')} error={errors.deadlineDate?.message} required={false} />

          <FormAlert message={vm.errorMessage} />
        </form>
      </SheetContent>
    </Sheet>
  )
}

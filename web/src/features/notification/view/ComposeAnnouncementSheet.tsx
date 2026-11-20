import { Info, Send } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Controller } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Switch } from '@/shared/ui/Switch'
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, audienceKey } from '../viewModel/announcementSchema'
import { useComposeAnnouncementViewModel } from '../viewModel/useComposeAnnouncementViewModel'

function ComposeForm({ onClose, onPendingChange }: { onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const switchId = useId()
  const vm = useComposeAnnouncementViewModel(onClose)
  const { register, formState, control } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Gửi thông báo"
      description={`CLB hiện hành: ${vm.clubName}. Người nhận đọc trong mục Thông báo.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={!vm.canSubmit}>
            <Send aria-hidden />
            Gửi thông báo
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        {vm.audiencesLoading && (
          <div role="status" aria-label="Đang tải nhóm nhận">
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {vm.audiencesError && <ErrorState error={vm.audiencesError} onRetry={vm.retryAudiences} />}
        {!vm.audiencesLoading && !vm.audiencesError && (
          <FormField
            label="Gửi tới"
            required
            error={errors.audience?.message}
            hint={vm.selected ? `${vm.selected.recipientCount} người sẽ nhận, không tính bạn.` : 'Chỉ có các nhóm thuộc phạm vi chức vụ của bạn.'}
          >
            <NativeSelect {...register('audience')}>
              <option value="" disabled>
                Chọn nhóm nhận
              </option>
              {vm.audiences.map((audience) => (
                <option key={audienceKey(audience)} value={audienceKey(audience)} disabled={audience.recipientCount === 0}>
                  {audience.label} ({audience.recipientCount > 0 ? `${audience.recipientCount} người` : 'chưa có ai'})
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        {vm.nothingToSend && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            Hiện bạn không có nhóm nào để gửi: chức vụ của bạn không còn phạm vi gửi thông báo, hoặc các nhóm chưa có ai ngoài bạn.
          </p>
        )}
        <FormField label="Tiêu đề" required error={errors.title?.message}>
          <Input maxLength={ANNOUNCEMENT_TITLE_MAX} placeholder="Ví dụ: Lịch sinh hoạt tháng 12" {...register('title')} />
        </FormField>
        <FormField label="Nội dung" required error={errors.body?.message} hint={`Văn bản thuần, tối đa ${ANNOUNCEMENT_BODY_MAX} ký tự.`}>
          <Textarea rows={8} maxLength={ANNOUNCEMENT_BODY_MAX} {...register('body')} />
        </FormField>
        <Controller
          control={control}
          name="sendEmail"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
              <label htmlFor={switchId} className="min-w-0 space-y-1">
                <span className="block text-sm font-semibold">Gửi kèm email</span>
                <span className="block text-xs text-muted-foreground">Người nhận có thêm một email cùng nội dung, gửi tới địa chỉ đăng ký tài khoản.</span>
              </label>
              <Switch id={switchId} checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} />
            </div>
          )}
        />
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

/** FR-NOT-01: chỉ mở khi máy chủ trả `SEND_ANNOUNCEMENT` cho CLB hiện hành. */
export function ComposeAnnouncementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && <ComposeForm onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}

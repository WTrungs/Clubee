import type { UseFormReturn } from 'react-hook-form'
import { DateTimeRow } from '@/shared/ui/DateTimeRow'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import type { SessionFormValues } from '../viewModel/sessionFormSchema'

/** Các ô chung của tạo buổi và sửa một buổi (FR-ATT-01, FR-ATT-02). */
export function SessionFormFields({ form }: { form: UseFormReturn<SessionFormValues> }) {
  const { register, formState } = form
  const errors = formState.errors
  return (
    <>
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
    </>
  )
}

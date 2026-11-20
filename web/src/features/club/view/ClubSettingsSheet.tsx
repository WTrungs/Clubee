import { CalendarCheck, CalendarDays, CalendarRange, Coins, ListTodo, UsersRound, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react'
import { Controller, useWatch, type Control } from 'react-hook-form'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input } from '@/shared/ui/Input'
import { MoneyInput } from '@/shared/ui/MoneyInput'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Switch } from '@/shared/ui/Switch'
import type { ClubSettings } from '../model/clubTypes'
import { useCurrentClub } from '../viewModel/clubContext'
import type { ClubSettingsFormValues } from '../viewModel/clubSettingsSchema'
import { useClubSettingsQuery, useClubSettingsViewModel } from '../viewModel/useClubSettingsViewModel'

function UnitInput({ unit, className, ...props }: ComponentProps<'input'> & { unit: string }) {
  return (
    <span className={cn('relative block', className)}>
      <Input inputMode="numeric" autoComplete="off" maxLength={4} className="pr-14 tabular-nums" {...props} />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
        {unit}
      </span>
    </span>
  )
}

function Group({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  const descriptionId = useId()
  return (
    <fieldset aria-describedby={descriptionId} className="space-y-4 rounded-2xl border p-4">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3" aria-hidden>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-bold">{title}</span>
          <span id={descriptionId} className="block text-xs text-muted-foreground">
            {description}
          </span>
        </span>
      </div>
      {children}
    </fieldset>
  )
}

/** Công tắc kèm nhãn, mô tả và lỗi theo ô; bấm vào nhãn cũng đổi công tắc. */
function SwitchField({ control, name, label, description }: { control: Control<ClubSettingsFormValues>; name: 'probationStep' | 'splitSummer'; label: string; description: string }) {
  const switchId = useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-4">
            <label htmlFor={switchId} className="min-w-0 space-y-1">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </label>
            <Switch
              id={switchId}
              checked={field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? `${switchId}-error` : undefined}
            />
          </div>
          {fieldState.error && (
            <p id={`${switchId}-error`} role="alert" className="text-xs font-medium text-destructive">
              {fieldState.error.message}
            </p>
          )}
        </div>
      )}
    />
  )
}

/** Ngày trong năm dạng dd/mm; không dùng bàn phím số để iOS vẫn có dấu `/`. */
function MonthDayInput(props: ComponentProps<'input'>) {
  return <Input placeholder="dd/mm" autoComplete="off" maxLength={5} className="tabular-nums" {...props} />
}

function ClubSettingsForm({ settings, onClose, onPendingChange }: { settings: ClubSettings; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useClubSettingsViewModel(settings, onClose)
  const { register, formState, control } = vm.form
  const splitSummer = useWatch({ control, name: 'splitSummer' })
  const errors = formState.errors
  useEffect(() => {
    onPendingChange(vm.pending)
    // Lưu xong thì sheet đóng trước khi `pending` kịp về false; lúc mở lại, form chỉ gắn sau khi tải xong nên phải tự đặt lại.
    return () => onPendingChange(false)
  }, [vm.pending, onPendingChange])

  return (
    <form id={formId} noValidate onSubmit={vm.submit} className="flex min-h-full flex-col">
      <div className="flex-1 space-y-5 p-5">
        <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Tham số CLB vừa được người khác sửa. Tải lại để xem giá trị mới nhất rồi sửa lại." />
        <p className="text-sm text-muted-foreground">
          Giá trị mới chỉ áp cho việc phát sinh từ nay. Khoản chi đã duyệt, lời mời đã gửi, buổi đã chốt điểm danh và người đang thử việc giữ nguyên.
        </p>
        <Group icon={UsersRound} title="Thành viên" description="Duyệt gia nhập và lời mời.">
          <SwitchField control={control} name="probationStep" label="Có bước thử việc" description="Bật thì ban chủ nhiệm chọn được cho người mới vào Thử việc trước khi thành Chính thức." />
          <FormField label="Hạn liên kết mời" required error={errors.inviteLinkDays?.message} hint="Liên kết mời gia nhập hết hiệu lực sau số ngày này.">
            <UnitInput unit="ngày" {...register('inviteLinkDays')} />
          </FormField>
        </Group>
        <Group icon={CalendarDays} title="Sự kiện" description="Đăng ký tham dự.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Hạn hủy đăng ký" required error={errors.registrationCancelHours?.message} hint="Người đã nhận chỗ hủy được tới trước giờ bắt đầu số giờ này.">
              <UnitInput unit="giờ" {...register('registrationCancelHours')} />
            </FormField>
            <FormField label="Hạn xác nhận lại khi dời giờ" required error={errors.rescheduleConfirmHours?.message} hint="Quá hạn mà chưa xác nhận thì đăng ký bị hủy.">
              <UnitInput unit="giờ" {...register('rescheduleConfirmHours')} />
            </FormField>
          </div>
        </Group>
        <Group icon={CalendarCheck} title="Điểm danh" description="Buổi sinh hoạt và sự kiện.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Mở điểm danh trước giờ" required error={errors.attendanceLeadMinutes?.message} hint="Tính từ giờ bắt đầu.">
              <UnitInput unit="phút" {...register('attendanceLeadMinutes')} />
            </FormField>
            <FormField label="Chu kỳ đổi mã QR" required error={errors.attendanceQrRotateSeconds?.message} hint="Mã ngắn hạn khó chia sẻ hơn.">
              <UnitInput unit="giây" {...register('attendanceQrRotateSeconds')} />
            </FormField>
          </div>
        </Group>
        <Group icon={ListTodo} title="Công việc" description="Nhắc người làm trước hạn.">
          <FormField label="Nhắc trước hạn" required error={errors.taskReminderDays?.message} hint="Tính theo ngày: 1 là nhắc từ đầu ngày trước hạn; 0 là không nhắc.">
            <UnitInput unit="ngày" {...register('taskReminderDays')} />
          </FormField>
        </Group>
        <Group icon={Coins} title="Tài chính" description="Áp cho mọi quỹ của CLB.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Ngưỡng bắt buộc chứng từ" required error={errors.expenseReceiptThreshold?.message} hint="Khoản chi lớn hơn số này phải đính kèm chứng từ.">
              <MoneyInput {...register('expenseReceiptThreshold')} />
            </FormField>
            <FormField label="Hạn quyết toán tạm ứng" required error={errors.advanceSettleDays?.message} hint="Gợi ý sẵn khi đề xuất tạm ứng, tính từ ngày đề xuất.">
              <UnitInput unit="ngày" {...register('advanceSettleDays')} />
            </FormField>
          </div>
        </Group>
        <Group icon={CalendarRange} title="Báo cáo" description="Mốc ngày/tháng lặp lại mỗi năm, dùng để chia học kỳ trong báo cáo thu chi.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Học kỳ 1 bắt đầu" required error={errors.semester1Start?.message} hint="Ngày/tháng, ví dụ 01/09.">
              <MonthDayInput {...register('semester1Start')} />
            </FormField>
            <FormField label="Học kỳ 2 bắt đầu" required error={errors.semester2Start?.message} hint="Ngày/tháng, ví dụ 01/02.">
              <MonthDayInput {...register('semester2Start')} />
            </FormField>
          </div>
          <SwitchField control={control} name="splitSummer" label="Tách kỳ hè" description="Tắt thì kỳ hè tính vào học kỳ 2." />
          {splitSummer && (
            <FormField label="Kỳ hè bắt đầu" required error={errors.summerStart?.message} hint="Sau học kỳ 2, trước học kỳ 1 năm sau.">
              <MonthDayInput {...register('summerStart')} />
            </FormField>
          )}
        </Group>
        {vm.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Sửa lần cuối {formatDateTime(vm.updatedAt)}
            {vm.updatedBy && ` bởi ${vm.updatedBy.fullName}`}.
          </p>
        )}
        <FormAlert message={vm.errorMessage} />
      </div>
      {/* Thanh nút nằm trong form để SheetContent không phải gắn lại khi tải xong. */}
      <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-popover px-5 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={vm.pending}>
          Hủy bỏ
        </Button>
        <Button type="submit" loading={vm.pending} disabled={vm.conflict}>
          Lưu tham số
        </Button>
      </div>
    </form>
  )
}

function ClubSettingsBody({ onClose, onPendingChange }: { onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const { club } = useCurrentClub()
  const query = useClubSettingsQuery()
  return (
    <SheetContent title="Tham số CLB" description={`CLB hiện hành: ${club.name}.`}>
      {query.data ? (
        <ClubSettingsForm settings={query.data} onClose={onClose} onPendingChange={onPendingChange} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-5" />
      ) : (
        <div className="space-y-4 p-5" role="status" aria-label="Đang tải tham số CLB">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </SheetContent>
  )
}

/** FR-CLB-03: chỉ mở khi máy chủ trả `EDIT_CLUB`. */
export function ClubSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  const close = () => {
    setPending(false)
    onClose()
  }
  return (
    <Sheet open={open} onOpenChange={(next) => !next && !pending && close()}>
      {open && <ClubSettingsBody onClose={close} onPendingChange={setPending} />}
    </Sheet>
  )
}

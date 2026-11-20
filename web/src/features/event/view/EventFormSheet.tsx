import { Globe2, MapPin } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { DateTimeRow } from '@/shared/ui/DateTimeRow'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect, Textarea } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Switch } from '@/shared/ui/Switch'
import { useEventFormViewModel, type EventFormMode } from '../viewModel/useEventFormViewModel'

interface EventFormSheetProps {
  clubId: string
  clubName: string
  mode: EventFormMode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EventFormSheet({ clubId, clubName, mode, open, onOpenChange }: EventFormSheetProps) {
  const formId = useId()
  const guestSwitchId = useId()
  const vm = useEventFormViewModel(clubId, mode, () => onOpenChange(false))
  const { register, formState } = vm.form
  const errors = formState.errors
  const create = mode === 'create'

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
        title={create ? 'Tạo sự kiện' : 'Đề xuất sự kiện'}
        description={
          create
            ? `CLB hiện hành: ${clubName}. Sự kiện do ban chủ nhiệm tạo được duyệt ngay.`
            : `CLB hiện hành: ${clubName}. Đề xuất được lưu ở Dự thảo, gửi duyệt khi sẵn sàng.`
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                vm.reset()
                onOpenChange(false)
              }}
              disabled={vm.pending}
            >
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} loading={vm.pending}>
              {create ? 'Tạo sự kiện' : 'Lưu đề xuất'}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
          <FormField label="Tên sự kiện" required error={errors.name?.message}>
            <Input placeholder="Ví dụ: Đêm nhạc Mùa đông" maxLength={150} {...register('name')} />
          </FormField>
          <FormField label="Nội dung" error={errors.description?.message}>
            <Textarea placeholder="Mục đích, chương trình, đối tượng tham dự…" maxLength={3000} {...register('description')} />
          </FormField>

          <DateTimeRow label="Bắt đầu" date={register('startDate')} time={register('startTime')} error={errors.startDate?.message ?? errors.startTime?.message} />
          <DateTimeRow label="Kết thúc" date={register('endDate')} time={register('endTime')} error={errors.endDate?.message ?? errors.endTime?.message} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Hình thức</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'OFFLINE', label: 'Trực tiếp', icon: MapPin },
                  { value: 'ONLINE', label: 'Trực tuyến', icon: Globe2 },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={vm.format === value}
                  onClick={() => vm.setFormat(value)}
                  className={cn(
                    'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
                    vm.format === value ? 'border-primary bg-primary-soft text-on-primary-soft' : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {vm.format === 'OFFLINE' ? (
            <FormField label="Địa điểm" required error={errors.location?.message}>
              <Input placeholder="Ví dụ: Hội trường A" maxLength={200} {...register('location')} />
            </FormField>
          ) : (
            <FormField label="Liên kết tham gia" required error={errors.onlineUrl?.message}>
              <Input type="url" inputMode="url" placeholder="https://…" {...register('onlineUrl')} />
            </FormField>
          )}

          <FormField label="Số chỗ" error={errors.capacity?.message} hint="Để trống nếu không giới hạn. Hết chỗ thì người đăng ký sau vào danh sách chờ.">
            <Input inputMode="numeric" placeholder="Không giới hạn" maxLength={5} {...register('capacity')} />
          </FormField>
          <DateTimeRow label="Hạn đăng ký" date={register('deadlineDate')} time={register('deadlineTime')} error={errors.deadlineDate?.message} required={false} />

          <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-3">
            <label htmlFor={guestSwitchId}>
              <span className="block text-sm font-semibold">Mở cho khách</span>
              <span className="block text-xs text-muted-foreground">Người ngoài CLB đăng ký trên trang công khai.</span>
            </label>
            <Switch id={guestSwitchId} checked={vm.openToGuests} onCheckedChange={vm.setOpenToGuests} />
          </div>

          {create && (
            <FormField label="Trưởng BTC" required error={vm.leadsError ?? errors.leadUserId?.message} hint="Thành viên Thử việc hoặc Chính thức, không cần giữ chức vụ.">
              <NativeSelect disabled={vm.leadsLoading} {...register('leadUserId')}>
                <option value="">{vm.leadsLoading ? 'Đang tải…' : 'Chọn Trưởng BTC…'}</option>
                {vm.leadCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.fullName}
                    {candidate.departmentName ? ` · Ban ${candidate.departmentName}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}

          <FormAlert message={vm.errorMessage} />
        </form>
      </SheetContent>
    </Sheet>
  )
}

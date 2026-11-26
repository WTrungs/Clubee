import { Hourglass, UsersRound } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import type { EventDetail } from '../model/eventTypes'
import { signupQuotaText, useStaffSignupViewModel } from '../viewModel/useStaffSignupViewModels'
import { WarningNote } from '@/shared/ui/WarningNote'
import { conflictText } from '../viewModel/eventDisplay'

/** FR-EVT-06: thẻ ở tab Tổng quan khi BTC mở đăng ký nhân sự; thành viên chọn tiểu ban, đủ chỉ tiêu thì xin Trưởng BTC. */
export function StaffSignupCard({ event }: { event: EventDetail }) {
  const vm = useStaffSignupViewModel(event)
  const info = vm.info
  if (!vm.visible || !info) return null
  return (
    <section aria-labelledby="staff-signup" className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="space-y-1">
        <h2 id="staff-signup" className="flex items-center gap-2 text-base font-bold">
          <UsersRound aria-hidden className="size-5 text-primary" />
          Tham gia ban tổ chức
        </h2>
        <p className="text-sm text-muted-foreground">Ban tổ chức đang mở cho thành viên tự đăng ký vào tiểu ban.</p>
      </div>
      {info.mySubcommitteeName ? (
        <p className="rounded-xl bg-status-success-soft p-3 text-sm font-medium text-status-success">Bạn đang ở tiểu ban {info.mySubcommitteeName}.</p>
      ) : info.myRequest?.status === 'PENDING' ? (
        <p className="flex items-start gap-2 rounded-xl bg-status-warning-soft p-3 text-sm font-medium text-status-warning">
          <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
          Yêu cầu vào tiểu ban {info.myRequest.subcommitteeName} đang chờ Trưởng BTC duyệt.
        </p>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            vm.submit()
          }}
        >
          {info.myRequest?.status === 'REJECTED' && (
            <p className="rounded-xl bg-muted p-3 text-sm">
              Yêu cầu vào tiểu ban {info.myRequest.subcommitteeName} không được duyệt. Lý do: {info.myRequest.reason}
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Chọn tiểu ban</legend>
            {info.subcommittees.map((subcommittee) => (
              <label
                key={subcommittee.id}
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="staffSignup"
                  checked={vm.selectedId === subcommittee.id}
                  onChange={() => vm.select(subcommittee.id)}
                  className="row-span-2 mt-1 size-4 accent-primary"
                />
                <span className="text-sm font-semibold">Tiểu ban {subcommittee.name}</span>
                <span className="text-xs text-muted-foreground">{signupQuotaText(subcommittee)}</span>
              </label>
            ))}
            {vm.selectError && <p className="text-sm font-medium text-status-danger">{vm.selectError}</p>}
          </fieldset>
          {info.conflicts.length > 0 && (
            <WarningNote>
              <p>Sự kiện chồng giờ với hoạt động bạn đang tham gia; bạn vẫn đăng ký được:</p>
              <ul className="list-disc pl-4">
                {info.conflicts.map((conflict) => (
                  <li key={`${conflict.kind}-${conflict.startAt}-${conflict.title ?? ''}`}>{conflictText(conflict)}</li>
                ))}
              </ul>
            </WarningNote>
          )}
          {vm.needsNote && (
            <FormField label="Lời nhắn gửi Trưởng BTC" required error={vm.noteError} hint="Tiểu ban đã đủ chỉ tiêu; Trưởng BTC sẽ quyết định có nhận thêm hay không.">
              <Textarea rows={3} value={vm.note} onChange={(changeEvent) => vm.setNote(changeEvent.target.value)} maxLength={vm.noteMax} />
            </FormField>
          )}
          <FormAlert message={vm.errorMessage} />
          <Button type="submit" loading={vm.pending}>
            {vm.needsNote ? 'Gửi yêu cầu vượt chỉ tiêu' : 'Đăng ký vào tiểu ban'}
          </Button>
        </form>
      )}
    </section>
  )
}

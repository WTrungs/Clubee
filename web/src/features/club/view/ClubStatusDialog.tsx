import { useId } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, Textarea } from '@/shared/ui/Input'
import { clubStatusDisplay, clubTransitionDisplay } from '../viewModel/clubStatusDisplay'
import { useClubStatusViewModel } from '../viewModel/useClubStatusViewModel'

/** FR-CLB-04: chọn thao tác hợp lệ theo trạng thái hiện tại, nhập lý do; giải thể phải gõ lại tên viết tắt. */
export function ClubStatusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vm = useClubStatusViewModel(open, onClose)
  const formId = useId()
  const confirm = vm.action ? clubTransitionDisplay[vm.action] : null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !vm.pending && onClose()}>
      <DialogContent
        title="Đổi trạng thái CLB"
        description={`${vm.clubName} đang ở trạng thái ${clubStatusDisplay[vm.status].label}.`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} variant={vm.action === 'DISSOLVE' ? 'destructive' : 'primary'} loading={vm.pending} disabled={vm.conflict}>
              {confirm?.confirm ?? 'Xác nhận'}
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
            vm.submit()
          }}
        >
          <ConflictBanner show={vm.conflict} onReload={vm.reload} message="CLB vừa được người khác cập nhật. Tải lại rồi chọn lại thao tác." />
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Thao tác</legend>
            {vm.options.map(({ action, label, hint }) => (
              <label
                key={action}
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="clubTransition"
                  value={action}
                  checked={vm.action === action}
                  onChange={() => vm.selectAction(action)}
                  className="row-span-2 mt-1 size-4 accent-primary"
                />
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </label>
            ))}
            {vm.actionError && <p className="text-sm font-medium text-status-danger">{vm.actionError}</p>}
          </fieldset>
          <FormField label="Lý do" required error={vm.reasonError}>
            <Textarea value={vm.reason} onChange={(event) => vm.setReason(event.target.value)} maxLength={vm.reasonMax} placeholder="Ví dụ: Nghỉ hè, tạm dừng sinh hoạt đến tháng 9." />
          </FormField>
          {vm.needsShortName && (
            <FormField label={`Gõ ${vm.shortName} để xác nhận giải thể`} required error={vm.shortNameError}>
              <Input value={vm.confirmText} onChange={(event) => vm.setConfirmText(event.target.value)} autoComplete="off" />
            </FormField>
          )}
          <FormAlert message={vm.errorMessage} />
          {vm.eventsPath && (
            <Button asChild variant="outline" size="sm">
              <Link to={vm.eventsPath} onClick={onClose}>
                Xem danh sách sự kiện
              </Link>
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

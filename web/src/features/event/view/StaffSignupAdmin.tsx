import { Check, X } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Switch } from '@/shared/ui/Switch'
import type { EventDetail } from '../model/eventTypes'
import { useStaffSignupAdminViewModel } from '../viewModel/useStaffSignupViewModels'

/** FR-EVT-06: công tắc mở đăng ký nhân sự và danh sách yêu cầu vượt chỉ tiêu chờ Trưởng BTC (BR-EVT-07). */
export function StaffSignupAdmin({ event, canManage }: { event: EventDetail; canManage: boolean }) {
  const vm = useStaffSignupAdminViewModel(event, canManage)
  if (!vm.canToggle && !vm.canDecide) return null
  return (
    <div className="space-y-3">
      {vm.canToggle && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <div className="min-w-0">
            <p id="staff-signup-switch" className="text-sm font-semibold">
              Mở cho thành viên tự đăng ký
            </p>
            <p className="text-xs text-muted-foreground">Thành viên chọn tiểu ban ở tab Tổng quan; tiểu ban đủ chỉ tiêu thì thành yêu cầu chờ Trưởng BTC duyệt.</p>
          </div>
          <Switch aria-labelledby="staff-signup-switch" checked={vm.open} disabled={vm.toggling} onCheckedChange={vm.toggle} />
        </div>
      )}
      {vm.canDecide && vm.requests.length > 0 && (
        <section aria-labelledby="staff-requests" className="space-y-2 rounded-2xl border border-status-warning/40 bg-status-warning-soft/40 p-4">
          <h3 id="staff-requests" className="text-sm font-bold">
            Yêu cầu vượt chỉ tiêu ({vm.requests.length})
          </h3>
          <ul className="space-y-2">
            {vm.requests.map((request) => (
              <li key={request.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-2.5">
                  <Avatar name={request.person.fullName} size="sm" />
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="font-semibold">
                      {request.person.fullName} → Tiểu ban {request.subcommitteeName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.quota !== null && `${request.memberCount}/${request.quota} người · `}
                      {formatDateTime(request.createdAt)}
                    </p>
                    <p className="break-words">“{request.note}”</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => vm.setRejecting(request)} aria-label={`Từ chối ${request.person.fullName}`}>
                    <X aria-hidden />
                    Từ chối
                  </Button>
                  <Button size="sm" onClick={() => vm.approve(request)} loading={vm.approvingId === request.id} aria-label={`Duyệt ${request.person.fullName}`}>
                    <Check aria-hidden />
                    Duyệt
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ReasonDialog
        open={vm.rejecting !== null}
        onOpenChange={(open) => !open && vm.setRejecting(null)}
        title="Từ chối yêu cầu vượt chỉ tiêu"
        description={vm.rejecting ? `${vm.rejecting.person.fullName} xin vào tiểu ban ${vm.rejecting.subcommitteeName}.` : undefined}
        confirmLabel="Từ chối"
        confirmVariant="destructive"
        pending={vm.rejectPending}
        onConfirm={vm.reject}
      />
    </div>
  )
}

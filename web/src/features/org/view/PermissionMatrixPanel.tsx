import { History, Lock, RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { formatDateTime } from '@/shared/format/formatDate'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { NativeSelect } from '@/shared/ui/Input'
import { Pagination } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Switch } from '@/shared/ui/Switch'
import { PERMISSION_CATALOG } from '../model/permissionCatalog'
import type { PositionRole } from '../model/orgTypes'
import type { PermissionKey, PermissionMatrix, PermissionMatrixCell } from '../model/permissionTypes'
import { positionRoleLabel } from '../viewModel/orgDisplay'
import { cellKey, describeChange, groupPermissions, permissionLabel, shownEnabled, switchLabel } from '../viewModel/permissionDisplay'
import { usePermissionMatrixViewModel, type PermissionMatrixViewModel } from '../viewModel/usePermissionMatrixViewModel'

const cellOf = (matrix: PermissionMatrix, role: PositionRole, permission: PermissionKey) => matrix.cells.find((cell) => cell.role === role && cell.permission === permission)

/** Một ô: vô nghĩa thì gạch ngang, khóa thì có biểu tượng, khác mặc định thì có chấm; lý do khóa nối qua `describedBy`. */
function CellControl({ cell, vm, id, describedBy }: { cell: PermissionMatrixCell; vm: PermissionMatrixViewModel; id?: string; describedBy?: string }) {
  if (cell.state === 'NOT_APPLICABLE') {
    return (
      <span className="text-muted-foreground" title={cell.lockReason ?? undefined}>
        —<span className="sr-only">{cell.lockReason}</span>
      </span>
    )
  }
  const enabled = shownEnabled(cell, vm.pending)
  const changed = vm.pending[cellKey(cell.role, cell.permission)] !== undefined
  const disabled = !vm.canEdit || cell.state !== 'EDITABLE' || vm.busy
  return (
    <span className="inline-flex items-center gap-1.5">
      {cell.state === 'LOCKED' && <Lock aria-hidden className="size-3.5 text-muted-foreground" />}
      <Switch
        id={id}
        checked={enabled}
        disabled={disabled}
        onCheckedChange={(next) => vm.toggle(cell, next)}
        aria-label={switchLabel(cell)}
        aria-describedby={describedBy}
        title={cell.lockReason ?? undefined}
        className={cn(changed && 'ring-2 ring-status-warning ring-offset-2 ring-offset-card')}
      />
      {cell.enabled !== cell.defaultEnabled && !changed && (
        <span className="size-1.5 rounded-full bg-status-info" title="Khác mặc định">
          <span className="sr-only">Khác mặc định</span>
        </span>
      )}
    </span>
  )
}

function MatrixTable({ matrix, vm }: { matrix: PermissionMatrix; vm: PermissionMatrixViewModel }) {
  const legendId = useId()
  const ownRoles = new Set(matrix.cells.filter((cell) => cell.state === 'OWN_ROLE').map((cell) => cell.role))
  // Mỗi lý do khóa hiện một lần dưới bảng, công tắc trỏ tới dòng đó để người dùng bàn phím, màn chạm vẫn đọc được.
  const reasons = [...new Set(matrix.cells.flatMap((cell) => (cell.state === 'LOCKED' || cell.state === 'OWN_ROLE') && cell.lockReason ? [cell.lockReason] : []))]
  const reasonId = (reason: string | null) => (reason && reasons.includes(reason) ? `${legendId}-${reasons.indexOf(reason)}` : undefined)
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table aria-label="Ma trận quyền theo chức vụ" className="w-full min-w-[960px] text-sm">
          <thead className="border-b bg-muted/50 text-xs font-semibold text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-muted px-4 py-3 text-left">
                Quyền
              </th>
              {matrix.roles.map((role) => (
                <th key={role} scope="col" className="px-2 py-3 text-center">
                  {positionRoleLabel[role]}
                  {ownRoles.has(role) && <span className="block font-normal">(chức vụ của bạn)</span>}
                </th>
              ))}
            </tr>
          </thead>
          {groupPermissions(matrix.permissions).map((group) => (
            <tbody key={group.group}>
              <tr className="border-t bg-muted/30">
                <th scope="rowgroup" colSpan={matrix.roles.length + 1} className="sticky left-0 px-4 py-2 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </th>
              </tr>
              {group.permissions.map((permission) => (
                <tr key={permission} className="border-t">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-normal">
                    <span className="block font-semibold">{permissionLabel(permission)}</span>
                    <span className="block text-xs text-muted-foreground">{PERMISSION_CATALOG[permission].description}</span>
                  </th>
                  {matrix.roles.map((role) => {
                    const cell = cellOf(matrix, role, permission)
                    return (
                      <td key={role} className="px-2 py-3 text-center">
                        {cell && <CellControl cell={cell} vm={vm} describedBy={reasonId(cell.lockReason)} />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <ul aria-label="Chú giải" className="space-y-1 text-xs text-muted-foreground">
        {reasons.map((reason, index) => (
          <li key={reason} id={`${legendId}-${index}`} className="flex items-start gap-1.5">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {reason}
          </li>
        ))}
        <li className="flex items-start gap-1.5">
          <span aria-hidden className="w-3.5 shrink-0 text-center">
            —
          </span>
          Không áp dụng với phạm vi của chức vụ.
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="mx-1 size-1.5 shrink-0 rounded-full bg-status-info" />
          Ô đang khác mặc định.
        </li>
      </ul>
    </div>
  )
}

function RoleList({ matrix, vm }: { matrix: PermissionMatrix; vm: PermissionMatrixViewModel }) {
  const roleId = useId()
  const rowId = useId()
  const role = vm.role
  if (!role) return null
  const ownRow = matrix.cells.find((cell) => cell.role === role && cell.state === 'OWN_ROLE')
  const ownReasonId = `${rowId}-own`
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={roleId} className="text-sm font-semibold">
          Chức vụ
        </label>
        <NativeSelect id={roleId} value={role} onChange={(event) => vm.setRole(event.target.value as PositionRole)}>
          {matrix.roles.map((candidate) => (
            <option key={candidate} value={candidate}>
              {positionRoleLabel[candidate]}
            </option>
          ))}
        </NativeSelect>
        {ownRow?.lockReason && (
          <p id={ownReasonId} className="text-xs text-muted-foreground">
            {ownRow.lockReason}
          </p>
        )}
      </div>
      {groupPermissions(matrix.permissions).map((group) => (
        <section key={group.group} aria-label={group.label} className="rounded-2xl border bg-card">
          <h3 className="border-b px-4 py-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">{group.label}</h3>
          <ul className="divide-y">
            {group.permissions.map((permission) => {
              const cell = cellOf(matrix, role, permission)
              if (!cell) return null
              const switchId = `${rowId}-${permission}`
              const reasonId = cell.state === 'OWN_ROLE' ? ownReasonId : cell.lockReason ? `${switchId}-reason` : undefined
              return (
                <li key={permission} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <label htmlFor={cell.state === 'NOT_APPLICABLE' ? undefined : switchId} className="block text-sm font-semibold">
                      {permissionLabel(permission)}
                    </label>
                    {cell.lockReason && cell.state !== 'OWN_ROLE' && (
                      <span id={`${switchId}-reason`} className="block text-xs text-muted-foreground">
                        {cell.lockReason}
                      </span>
                    )}
                  </span>
                  <CellControl cell={cell} vm={vm} id={switchId} describedBy={reasonId} />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ChangeHistory({ vm }: { vm: PermissionMatrixViewModel }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-bold">
        <History aria-hidden className="size-4 text-muted-foreground" />
        Thay đổi gần đây
      </h3>
      {vm.historyLoading && (
        <div role="status" aria-label="Đang tải thay đổi gần đây">
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}
      {vm.historyError && <ErrorState error={vm.historyError} />}
      {!vm.historyLoading && !vm.historyError && vm.history.length === 0 && <p className="text-sm text-muted-foreground">Chưa có thay đổi nào; ma trận đang theo mặc định.</p>}
      {vm.history.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card">
          {vm.history.map((change) => (
            <li key={change.id} className="px-4 py-3 text-sm">
              <span className="font-semibold">{positionRoleLabel[change.role]}</span> · {permissionLabel(change.permission)}: {change.before ? 'bật' : 'tắt'} → {change.after ? 'bật' : 'tắt'}
              <span className="block text-xs text-muted-foreground">
                {change.actor.fullName} · {formatDateTime(change.at)}
                {change.reset && ' · khôi phục mặc định'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={vm.historyPage} totalPages={vm.historyTotalPages} totalElements={vm.historyTotal} pageSize={20} onPageChange={vm.setHistoryPage} />
    </section>
  )
}

/** FR-ORG-05: ma trận quyền; từ 1024 px là bảng 7 cột chức vụ, hẹp hơn thì chọn từng chức vụ. */
export function PermissionMatrixPanel({ active }: { active: boolean }) {
  const vm = usePermissionMatrixViewModel(active)
  const wide = useMediaQuery('(min-width: 1024px)')
  const resetHintId = useId()
  const matrix = vm.matrix

  if (vm.loading) return <Skeleton className="h-96 rounded-2xl" />
  if (vm.loadError || !matrix) return <ErrorState error={vm.loadError} onRetry={vm.refetch} />

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Thay đổi có hiệu lực ngay sau khi lưu. Quyền xem thông tin thành viên không nằm ở đây.</p>
          {!vm.canEdit && <p className="font-semibold text-foreground">Bạn chỉ xem được; người có quyền chỉnh ma trận mới sửa được.</p>}
          {matrix.updatedAt && (
            <p>
              Sửa lần cuối {formatDateTime(matrix.updatedAt)}
              {matrix.updatedBy && ` bởi ${matrix.updatedBy.fullName}`} · {matrix.changedFromDefault} ô khác mặc định
            </p>
          )}
        </div>
        {vm.canReset && (
          <div className="flex flex-col gap-1 sm:items-end">
            <Button variant="outline" onClick={vm.openReset} disabled={vm.busy || matrix.changedFromDefault === 0 || vm.changes.length > 0} aria-describedby={vm.changes.length > 0 ? resetHintId : undefined}>
              <RotateCcw aria-hidden />
              Khôi phục mặc định
            </Button>
            {vm.changes.length > 0 && (
              <p id={resetHintId} className="text-xs text-muted-foreground">
                Lưu hoặc hủy thay đổi chưa lưu trước khi khôi phục.
              </p>
            )}
          </div>
        )}
      </div>
      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} message="Ma trận quyền vừa được người khác sửa. Tải lại để xem bản mới nhất; thay đổi chưa lưu sẽ bị bỏ." />
      <FormAlert message={vm.error?.message ?? null} details={vm.error?.details} />

      {wide ? <MatrixTable matrix={matrix} vm={vm} /> : <RoleList matrix={matrix} vm={vm} />}
      <ChangeHistory vm={vm} />

      {/* Vùng thông báo luôn có trên trang để trình đọc màn hình đọc cả lần thay đổi đầu tiên. */}
      <p role="status" className="sr-only">
        {vm.changes.length > 0 ? `Có ${vm.changes.length} thay đổi chưa lưu.` : ''}
      </p>
      {vm.changes.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-4 py-3 shadow-lg lg:left-64">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p aria-hidden className="text-sm font-semibold">
              {vm.changes.length} thay đổi chưa lưu
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={vm.discard} disabled={vm.busy}>
                Hủy
              </Button>
              <Button onClick={vm.openSave} disabled={vm.busy || !vm.canEdit}>
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={vm.dialog === 'save'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Lưu thay đổi quyền"
        description="Người đang giữ các chức vụ này nhận thông báo; quyền đổi ngay ở mọi màn."
        confirmLabel="Lưu thay đổi"
        pending={vm.busy}
        onConfirm={vm.confirmSave}
      >
        <ul className="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
          {vm.changes.map((change) => (
            <li key={cellKey(change.role, change.permission)}>{describeChange(change)}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={vm.dialog === 'reset'}
        onOpenChange={(open) => !open && vm.closeDialog()}
        title="Khôi phục mặc định"
        description="Mọi ô bạn sửa được trở về mặc định; hàng của chức vụ bạn đang giữ giữ nguyên. Người bị đổi quyền nhận thông báo."
        confirmLabel="Khôi phục"
        confirmVariant="destructive"
        pending={vm.busy}
        onConfirm={vm.confirmReset}
      />
    </div>
  )
}

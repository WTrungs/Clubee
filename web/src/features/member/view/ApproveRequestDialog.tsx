import { useId, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import { approvalTargets, memberStatusDisplay } from '../viewModel/memberDisplay'
import type { JoinRequestsViewModel } from '../viewModel/useJoinRequestsViewModel'

function ApproveForm({ vm }: { vm: JoinRequestsViewModel }) {
  const formId = useId()
  const request = vm.dialog?.request
  const targets = approvalTargets(request?.allowedActions ?? [])
  const [action, setAction] = useState(targets[0]?.action ?? 'APPROVE_ACTIVE')
  const [departmentId, setDepartmentId] = useState('')
  const [touched, setTouched] = useState(false)
  const departmentError = touched && !departmentId ? 'Chọn ban chính cho thành viên.' : undefined

  return (
    <DialogContent
      title="Duyệt yêu cầu gia nhập"
      description={`${request?.applicant.fullName ?? ''} sẽ trở thành thành viên với ban chính bạn chọn.`}
      footer={
        <>
          <Button variant="ghost" onClick={vm.closeDialog} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Duyệt
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          setTouched(true)
          if (departmentId) vm.approve(action, departmentId)
        }}
      >
        <FormField label="Ban chính" required error={vm.departmentsError ?? departmentError}>
          <NativeSelect value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} disabled={vm.departmentsLoading || vm.pending}>
            <option value="">{vm.departmentsLoading ? 'Đang tải…' : 'Chọn ban…'}</option>
            {vm.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {vm.departmentsError && (
          <Button type="button" variant="outline" size="sm" onClick={vm.retryDepartments}>
            Tải lại danh sách ban
          </Button>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Trạng thái sau khi duyệt</legend>
          <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {targets.map((target) => (
              <label
                key={target.action}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors',
                  action === target.action ? 'border-primary bg-primary-soft text-on-primary-soft' : 'hover:bg-muted/60',
                )}
              >
                <input
                  type="radio"
                  name="approval-target"
                  value={target.action}
                  checked={action === target.action}
                  onChange={() => setAction(target.action)}
                  className="size-4 accent-primary"
                />
                {memberStatusDisplay[target.status].label}
              </label>
            ))}
          </div>
          {targets.length === 1 && <p className="text-xs text-muted-foreground">CLB không dùng bước thử việc nên duyệt thẳng sang Chính thức.</p>}
        </fieldset>
      </form>
    </DialogContent>
  )
}

/** FR-MEM-03: duyệt sang Thử việc hoặc Chính thức kèm ban chính. */
export function ApproveRequestDialog({ vm }: { vm: JoinRequestsViewModel }) {
  const open = vm.dialog?.mode === 'approve'
  return (
    <Dialog open={open} onOpenChange={(next) => !next && vm.closeDialog()}>
      {open && <ApproveForm key={vm.dialog?.request.membershipId} vm={vm} />}
    </Dialog>
  )
}

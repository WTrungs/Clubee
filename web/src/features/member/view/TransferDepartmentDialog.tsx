import { useEffect, useId, useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import type { MemberDetail } from '../model/memberTypes'
import { NO_OTHER_DEPARTMENT_HINT } from '../viewModel/memberDisplay'
import { useTransferDepartmentViewModel } from '../viewModel/useTransferDepartmentViewModel'

function TransferForm({ member, onClose, onPendingChange }: { member: MemberDetail; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useTransferDepartmentViewModel(member.department?.id ?? null, onClose)
  const [toDepartmentId, setToDepartmentId] = useState('')
  const [touched, setTouched] = useState(false)
  const missing = touched && !toDepartmentId ? 'Chọn ban mới.' : undefined
  const [first = null, ...rest] = vm.errorLines
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <DialogContent
      title="Chuyển ban chính"
      description={`${member.department ? `${member.person.fullName} đang thuộc Ban ${member.department.name}.` : `${member.person.fullName} chưa có ban chính.`} Thuộc ban mới từ hôm nay; công việc đang làm ở ban cũ giữ nguyên.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending}>
            Chuyển ban
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
          if (toDepartmentId) vm.submit(toDepartmentId, [member])
        }}
      >
        <FormField
          label="Ban mới"
          required
          error={vm.departmentsError ?? missing}
          hint={vm.noOtherDepartment ? NO_OTHER_DEPARTMENT_HINT : undefined}
        >
          <NativeSelect
            value={toDepartmentId}
            onChange={(event) => {
              setToDepartmentId(event.target.value)
              vm.clearError()
            }}
            disabled={vm.departmentsLoading || vm.pending}
          >
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
        <FormAlert message={first} details={rest} />
      </form>
    </DialogContent>
  )
}

/** FR-MEM-10: chỉ mở khi máy chủ trả `TRANSFER_DEPARTMENT`. */
export function TransferDepartmentDialog({ member, open, onClose }: { member: MemberDetail | null; open: boolean; onClose: () => void }) {
  const [pending, setPending] = useState(false)
  return (
    <Dialog open={open && member !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && member && <TransferForm member={member} onClose={onClose} onPendingChange={setPending} />}
    </Dialog>
  )
}

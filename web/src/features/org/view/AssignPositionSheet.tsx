import { useEffect, useId, useState } from 'react'
import { formatDate } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Input, NativeSelect } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { positionRoleLabel } from '../viewModel/orgDisplay'
import { useAssignPositionViewModel } from '../viewModel/useAssignPositionViewModel'
import type { AssignPreset } from '../viewModel/useOrgStructureViewModel'

function AssignForm({ preset, clubName, onClose, onPendingChange }: { preset: AssignPreset; clubName: string; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useAssignPositionViewModel(preset, onClose)
  const { register, formState } = vm.form
  const errors = formState.errors
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])
  const personHint = vm.presetIneligible
    ? `${vm.lockedPerson?.fullName ?? 'Người này'} không đủ điều kiện giữ chức vụ ở phạm vi đã chọn (cần là thành viên Chính thức, đúng ban).`
    : undefined

  return (
    <SheetContent
      title="Gán chức vụ"
      description={`CLB hiện hành: ${clubName}. Chức vụ thường trực hết hiệu lực cùng nhiệm kỳ.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={vm.termMissing || vm.presetIneligible}>
            Gán chức vụ
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={vm.submit} className="space-y-5 p-5">
        {vm.termMissing && <FormAlert message="CLB chưa có nhiệm kỳ đang chạy nên chưa gán được chức vụ." />}
        <FormField label="Chức vụ" required error={errors.role?.message}>
          <NativeSelect value={vm.role} onChange={(event) => vm.setRole(event.target.value as typeof vm.role)}>
            <option value="">Chọn chức vụ…</option>
            {vm.roleOptions.map((role) => (
              <option key={role} value={role}>
                {positionRoleLabel[role]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {vm.needsDepartment && (
          <FormField label="Ban" required error={errors.departmentId?.message}>
            <NativeSelect value={vm.departmentId} onChange={(event) => vm.setDepartmentId(event.target.value)}>
              <option value="">Chọn ban…</option>
              {vm.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        {vm.lockedPerson ? (
          <FormField label="Người giữ chức vụ" error={errors.userId?.message ?? vm.candidatesError ?? undefined} hint={personHint}>
            <Input value={vm.lockedPerson.fullName} readOnly />
          </FormField>
        ) : (
          <FormField
            label="Người giữ chức vụ"
            required
            error={errors.userId?.message ?? vm.candidatesError ?? undefined}
            hint={vm.role ? 'Chỉ hiện thành viên Chính thức đủ điều kiện.' : 'Chọn chức vụ trước.'}
          >
            <NativeSelect disabled={!vm.role || vm.candidatesLoading} value={vm.userId} onChange={(event) => vm.setUserId(event.target.value)}>
              <option value="">{vm.candidatesLoading ? 'Đang tải…' : 'Chọn người…'}</option>
              {vm.candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName}
                  {candidate.departmentName ? ` · Ban ${candidate.departmentName}` : ''}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        {vm.candidatesError && (
          <Button type="button" variant="outline" size="sm" onClick={vm.retryCandidates}>
            Tải lại danh sách người đủ điều kiện
          </Button>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Bắt đầu" required error={errors.startDate?.message}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('startDate')} />
          </FormField>
          <FormField label="Kết thúc" required error={errors.endDate?.message} hint={vm.termEnd ? `Muộn nhất ${formatDate(vm.termEnd)} (hết nhiệm kỳ).` : undefined}>
            <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...register('endDate')} />
          </FormField>
        </div>
        <FormAlert message={vm.errorMessage} />
      </form>
    </SheetContent>
  )
}

interface AssignPositionSheetProps {
  preset: AssignPreset | null
  clubName: string
  onClose: () => void
}

/** FR-ORG-02: gán chức vụ thường trực; mở từ màn Cơ cấu hoặc hồ sơ thành viên. */
export function AssignPositionSheet({ preset, clubName, onClose }: AssignPositionSheetProps) {
  // Không đóng khi đang chờ máy chủ trả lời (NFR-REL-01).
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={preset !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {preset && (
        <AssignForm
          key={`${preset.role ?? ''}-${preset.departmentId ?? ''}-${preset.userId ?? ''}`}
          preset={preset}
          clubName={clubName}
          onClose={onClose}
          onPendingChange={setPending}
        />
      )}
    </Sheet>
  )
}

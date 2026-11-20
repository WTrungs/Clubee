import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { positionRoleLabel, STANDING_ROLES } from '@/features/org/viewModel/orgDisplay'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import type { Handover } from '../model/handoverTypes'
import { useAppointmentsViewModel } from '../viewModel/useAppointmentsViewModel'

type AppointmentsVm = ReturnType<typeof useAppointmentsViewModel>

function AppointmentRow({ vm, index }: { vm: AppointmentsVm; index: number }) {
  const { register, formState, setValue } = vm.form
  const errors = formState.errors.rows?.[index]
  // Đổi chức vụ hoặc ban thì người đã chọn có thể không còn hợp lệ, nên chọn lại.
  const resetPerson = () => setValue(`rows.${index}.userId`, '')
  const people = vm.peopleFor(index)
  const saved = vm.savedChoice(index)

  return (
    <li className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Người được bầu {index + 1}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => vm.removeRow(index)} className="text-destructive" aria-label={`Bỏ người được bầu ${index + 1}`}>
          <Trash2 aria-hidden />
          Bỏ dòng
        </Button>
      </div>
      <FormField label="Chức vụ" required error={errors?.role?.message}>
        <NativeSelect {...register(`rows.${index}.role`, { onChange: resetPerson })}>
          {STANDING_ROLES.map((role) => (
            <option key={role} value={role}>
              {positionRoleLabel[role]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {vm.needsDepartment(index) && (
        <FormField label="Ban" required error={errors?.departmentId?.message} hint="Chỉ các ban được giữ trong kế hoạch của nhiệm kỳ mới.">
          <NativeSelect {...register(`rows.${index}.departmentId`, { onChange: resetPerson })}>
            <option value="">Chọn ban</option>
            {vm.departmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      <FormField label="Người được bầu" required error={errors?.userId?.message}>
        <NativeSelect {...register(`rows.${index}.userId`)}>
          <option value="">{vm.peopleError ? 'Chưa tải được danh sách thành viên' : people.length === 0 ? 'Không có thành viên Chính thức phù hợp' : 'Chọn người'}</option>
          {saved && (
            <option value={saved.person.id} disabled={!saved.eligible}>
              {saved.eligible ? saved.person.fullName : `${saved.person.fullName} (không còn đủ điều kiện, chọn người khác)`}
            </option>
          )}
          {people.map((member) => (
            <option key={member.person.id} value={member.person.id}>
              {member.department ? `${member.person.fullName} · Ban ${member.department.name}` : member.person.fullName}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    </li>
  )
}

function AppointmentsForm({ handover, onClose, onPendingChange }: { handover: Handover; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useAppointmentsViewModel(handover, onClose)
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title="Kết quả bầu"
      description={`${handover.toTerm.name}. Chức vụ mới chỉ có hiệu lực khi bàn giao hoàn tất. Chỉ thành viên Chính thức; trưởng, phó ban phải có ban chính là ban đó.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={vm.conflict || vm.peopleLoading}>
            Lưu kết quả bầu
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Kết quả bầu vừa được người khác sửa. Tải lại để xem bản mới nhất rồi sửa lại." />
        <FormAlert message={vm.peopleError ? 'Không tải được danh sách thành viên. Đóng rồi mở lại để thử lại.' : null} />
        <form id={formId} noValidate onSubmit={vm.submit} className="space-y-4">
          {/* Ô chọn người chỉ dựng khi đã có danh sách, để hiện đúng người đã lưu. */}
          {vm.peopleLoading ? (
            <div role="status" aria-label="Đang tải danh sách thành viên" className="space-y-3">
              <Skeleton className="h-52 rounded-2xl" />
              <Skeleton className="h-52 rounded-2xl" />
            </div>
          ) : (
            <>
              {vm.rows.length === 0 && <p className="text-sm text-muted-foreground">Chưa có ai. Thêm ít nhất một Chủ nhiệm cho nhiệm kỳ mới.</p>}
              <ul aria-label="Người được bầu" className="space-y-3">
                {vm.rows.map((row, index) => (
                  <AppointmentRow key={row.id} vm={vm} index={index} />
                ))}
              </ul>
              {vm.canAdd && (
                <Button type="button" variant="outline" onClick={vm.addRow} className="w-full">
                  <Plus aria-hidden />
                  Thêm người được bầu
                </Button>
              )}
            </>
          )}
          <FormAlert message={vm.errorMessage} />
        </form>
      </div>
    </SheetContent>
  )
}

/** FR-TERM-03: ban chủ nhiệm cũ ghi kết quả bầu của nhiệm kỳ mới. */
export function AppointmentsSheet({ handover, open, onClose }: { handover: Handover | null; open: boolean; onClose: () => void }) {
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={open && handover !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      {open && handover && <AppointmentsForm key={handover.id} handover={handover} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}

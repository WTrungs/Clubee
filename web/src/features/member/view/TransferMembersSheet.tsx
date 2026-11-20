import { useEffect, useId, useState } from 'react'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { NativeSelect } from '@/shared/ui/Input'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { MemberSummary } from '../model/memberTypes'
import { NO_OTHER_DEPARTMENT_HINT } from '../viewModel/memberDisplay'
import { useTransferDepartmentViewModel } from '../viewModel/useTransferDepartmentViewModel'
import { MemberStatusBadge } from './MemberTable'

export interface TransferSource {
  id: string
  name: string
  memberCount: number
}

interface MemberListState {
  members: MemberSummary[]
  membersLoading: boolean
  membersError: unknown
  onRetryMembers: () => void
}

interface TransferMembersFormProps extends MemberListState {
  source: TransferSource
  onClose: () => void
  onPendingChange: (pending: boolean) => void
}

function TransferMembersForm({ source, members, membersLoading, membersError, onRetryMembers, onClose, onPendingChange }: TransferMembersFormProps) {
  const formId = useId()
  const vm = useTransferDepartmentViewModel(source.id, onClose)
  const [toDepartmentId, setToDepartmentId] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [touched, setTouched] = useState(false)
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])
  // Danh sách tải lại có thể bớt người; chỉ giữ lựa chọn của người còn trong danh sách.
  const chosen = members.filter((member) => selected.has(member.membershipId))
  const allChosen = members.length > 0 && chosen.length === members.length
  const [first = null, ...rest] = vm.errorLines

  const toggle = (membershipId: string) => {
    vm.clearError()
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(membershipId)) next.delete(membershipId)
      else next.add(membershipId)
      return next
    })
  }

  return (
    <SheetContent
      title={`Chuyển thành viên Ban ${source.name}`}
      description="Người được chọn thuộc ban mới từ hôm nay; công việc đang làm ở ban cũ giữ nguyên. Người đang giữ Trưởng ban, Phó ban phải được thu hồi chức vụ trước."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={chosen.length === 0 || Boolean(membersError)}>
            {chosen.length > 0 ? `Chuyển ${chosen.length} người` : 'Chuyển'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-5 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          setTouched(true)
          if (toDepartmentId && chosen.length > 0) vm.submit(toDepartmentId, chosen)
        }}
      >
        <FormField
          label="Chuyển sang ban"
          required
          error={vm.departmentsError ?? (touched && !toDepartmentId ? 'Chọn ban mới.' : undefined)}
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

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Người được chuyển</legend>
          {membersLoading && <Skeleton className="h-32 w-full" />}
          {Boolean(membersError) && <ErrorState error={membersError} onRetry={onRetryMembers} />}
          {!membersLoading && !membersError && members.length === 0 && <p className="text-sm text-muted-foreground">Ban không còn thành viên.</p>}
          {!membersLoading && !membersError && members.length > 0 && (
            <>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={allChosen}
                  disabled={vm.pending}
                  onChange={() => {
                    vm.clearError()
                    setSelected(allChosen ? new Set() : new Set(members.map((member) => member.membershipId)))
                  }}
                />
                Chọn tất cả ({members.length})
              </label>
              <ul className="space-y-1">
                {members.map((member) => (
                  <li key={member.membershipId}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-primary"
                        checked={selected.has(member.membershipId)}
                        disabled={vm.pending}
                        onChange={() => toggle(member.membershipId)}
                      />
                      <Avatar name={member.person.fullName} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{member.person.fullName}</span>
                        {member.positionTitles.length > 0 && <span className="block truncate text-xs text-muted-foreground">{member.positionTitles.join(', ')}</span>}
                      </span>
                      <MemberStatusBadge status={member.status} />
                    </label>
                  </li>
                ))}
              </ul>
              {source.memberCount > members.length && (
                <p className="text-xs text-muted-foreground">
                  Hiện {members.length}/{source.memberCount} người; chuyển xong thì mở lại để chuyển những người còn lại.
                </p>
              )}
            </>
          )}
        </fieldset>
        <FormAlert message={first} details={rest} />
      </form>
    </SheetContent>
  )
}

interface TransferMembersSheetProps extends MemberListState {
  source: TransferSource | null
  onClose: () => void
}

/** FR-MEM-10: chuyển nhiều người của một ban, ví dụ trước khi đóng ban (BR-TERM-04); chỉ mở khi máy chủ trả `TRANSFER_MEMBERS`. */
export function TransferMembersSheet({ source, onClose, ...list }: TransferMembersSheetProps) {
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={source !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      {source && <TransferMembersForm key={source.id} source={source} {...list} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}

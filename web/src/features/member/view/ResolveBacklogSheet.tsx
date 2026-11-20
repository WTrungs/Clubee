import { useEffect, useId, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { SearchInput } from '@/shared/ui/ListControls'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import type { ResolvingTarget } from '../viewModel/useBacklogViewModel'
import { useResolveBacklogViewModel } from '../viewModel/useResolveBacklogViewModel'

function ResolveForm({ target, onClose, onPendingChange }: { target: ResolvingTarget; onClose: () => void; onPendingChange: (pending: boolean) => void }) {
  const formId = useId()
  const vm = useResolveBacklogViewModel(target.item, target.action, onClose)
  useEffect(() => onPendingChange(vm.pending), [vm.pending, onPendingChange])

  return (
    <SheetContent
      title={vm.title}
      description={vm.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={vm.pending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} loading={vm.pending} disabled={!vm.canSubmit}>
            {vm.submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <ConflictBanner show={vm.conflict} onReload={onClose} message="Mục này vừa được người khác xử lý hoặc đã thay đổi. Danh sách đã tải lại; đóng để xem trạng thái mới." />
        <form
          id={formId}
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            vm.submit()
          }}
        >
          <SearchInput label="Tìm người" placeholder="Tìm theo tên…" value={vm.keyword} onValueChange={vm.setKeyword} />
          {vm.selected && (
            <p className="text-sm" role="status">
              Đã chọn: <span className="font-semibold">{vm.selected.fullName}</span>
            </p>
          )}
          {vm.candidatesLoading ? (
            <div role="status" aria-label="Đang tải ứng viên" className="space-y-2">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : vm.candidatesError ? (
            <div className="space-y-2">
              <FormAlert message={vm.candidatesError} />
              <Button type="button" variant="outline" size="sm" onClick={vm.retryCandidates}>
                Tải lại danh sách
              </Button>
            </div>
          ) : vm.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{vm.keyword ? 'Không có ai khớp từ khóa.' : 'Không có ai đủ điều kiện nhận mục này.'}</p>
          ) : (
            <fieldset className="space-y-2" disabled={vm.pending}>
              <legend className="sr-only">Chọn người</legend>
              {vm.candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm transition-colors duration-200 hover:border-input',
                    'has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-4 has-focus-visible:ring-primary/15',
                  )}
                >
                  <input
                    type="radio"
                    name="backlog-candidate"
                    value={candidate.id}
                    checked={vm.selected?.id === candidate.id}
                    onChange={() => vm.select(candidate)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 font-semibold">
                    {candidate.fullName}
                    {candidate.departmentName && <span className="block text-xs font-normal text-muted-foreground">Ban {candidate.departmentName}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <FormAlert message={vm.errorMessage} />
        </form>
      </div>
    </SheetContent>
  )
}

/** FR-MEM-09: giao lại việc, đổi người nghiệm thu hoặc chỉ định người giữ chức thay người đã rời. */
export function ResolveBacklogSheet({ target, onClose }: { target: ResolvingTarget | null; onClose: () => void }) {
  const [pending, setPending] = useState(false)
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      {target && <ResolveForm key={`${target.item.id}-${target.action}`} target={target} onClose={onClose} onPendingChange={setPending} />}
    </Sheet>
  )
}

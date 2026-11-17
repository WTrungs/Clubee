import { UserPlus } from 'lucide-react'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { FormAlert } from '@/shared/ui/FormAlert'
import { SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { useAttendanceCandidates } from '../viewModel/useAttendanceCandidates'
import type { AttendanceViewModel } from '../viewModel/useAttendanceViewModel'

interface AddExtraDialogProps {
  activity: AttendanceActivityRef
  vm: AttendanceViewModel
}

/** FR-ATT-07: người đến mà không thuộc đối tượng vẫn được ghi Có mặt, gắn nhãn phát sinh. */
export function AddExtraDialog({ activity, vm }: AddExtraDialogProps) {
  const candidates = useAttendanceCandidates(activity, vm.day, vm.extraOpen)
  const busy = vm.extraPendingId !== null

  return (
    <Dialog open={vm.extraOpen} onOpenChange={vm.setExtraOpen}>
      <DialogContent title="Thêm người phát sinh" description="Thành viên CLB không có trong danh sách mà vẫn đến; người được thêm ghi Có mặt.">
        <div className="space-y-3">
          <SearchInput label="Tìm thành viên" placeholder="Tìm theo họ tên…" value={candidates.keyword} onValueChange={candidates.setKeyword} />
          <FormAlert message={vm.extraError} />
          {candidates.loading && (
            <div className="space-y-2" role="status" aria-label="Đang tải thành viên">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {candidates.error && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-status-danger">
              Không tải được danh sách thành viên: {candidates.error}
              <Button variant="link" size="sm" onClick={candidates.retry}>
                Thử lại
              </Button>
            </p>
          )}
          {!candidates.loading && !candidates.error && candidates.candidates.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Không còn thành viên nào phù hợp.</p>
          )}
          <ul className="space-y-2">
            {candidates.candidates.map((candidate) => (
              <li key={candidate.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                <Avatar name={candidate.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{candidate.fullName}</span>
                  <span className="block text-xs text-muted-foreground">{candidate.departmentName ? `Ban ${candidate.departmentName}` : 'Chưa có ban'}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={vm.extraPendingId === candidate.id}
                  disabled={busy || !vm.canMark}
                  aria-label={`Thêm ${candidate.fullName}`}
                  onClick={() => vm.addExtra(candidate.id, candidate.fullName)}
                >
                  <UserPlus aria-hidden />
                  Thêm
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}

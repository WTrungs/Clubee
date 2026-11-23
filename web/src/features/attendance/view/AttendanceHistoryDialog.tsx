import { ArrowRight } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Dialog, DialogContent } from '@/shared/ui/Dialog'
import { attendanceStatusDisplay } from '../viewModel/attendanceDisplay'
import type { AttendanceViewModel } from '../viewModel/useAttendanceViewModel'

/** Lịch sử sửa sau khi chốt của một người (FR-ATT-08, BR-DATA-03), mới nhất trước. */
export function AttendanceHistoryDialog({ vm }: { vm: AttendanceViewModel }) {
  const row = vm.historyRow
  const changes = row?.record?.changes.toReversed() ?? []
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && vm.setHistoryRow(null)}>
      {row && (
        <DialogContent title={`Lịch sử sửa: ${row.person.fullName}`} description="Các lần sửa sau khi chốt điểm danh.">
          <ol className="space-y-3">
            {changes.map((change, index) => (
              <li key={`${change.at}-${index}`} className="space-y-1.5 rounded-xl border p-3">
                <p className="flex flex-wrap items-center gap-1.5">
                  {change.from ? (
                    <Badge tone={attendanceStatusDisplay[change.from].tone}>{attendanceStatusDisplay[change.from].label}</Badge>
                  ) : (
                    <Badge tone="neutral">Chưa có bản ghi</Badge>
                  )}
                  <ArrowRight aria-label="thành" className="size-4 text-muted-foreground" />
                  <Badge tone={attendanceStatusDisplay[change.to].tone}>{attendanceStatusDisplay[change.to].label}</Badge>
                </p>
                <p className="text-sm break-words">{change.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {change.by.fullName} · {formatDateTime(change.at)}
                </p>
              </li>
            ))}
          </ol>
        </DialogContent>
      )}
    </Dialog>
  )
}

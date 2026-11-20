import { motion } from 'motion/react'
import { QrCode } from 'lucide-react'
import { formatDateTime, formatTime, toVnDateKey } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { itemVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import { Spinner } from '@/shared/ui/Spinner'
import { toneVariants } from '@/shared/ui/tone'
import type { AttendanceRow, AttendanceStatus } from '../model/attendanceTypes'
import { ATTENDANCE_STATUSES, attendanceStatusDisplay } from '../viewModel/attendanceDisplay'

interface AttendanceListItemProps {
  row: AttendanceRow
  canMark: boolean
  pending: boolean
  now: number
  onMark: (status: AttendanceStatus) => void
}

/** Bản ghi của hôm nay chỉ cần giờ; bản ghi ngày khác (ví dụ nhập lại sau buổi) ghi cả ngày. */
const recordedLabel = (recordedAt: string, now: number) =>
  toVnDateKey(recordedAt) === toVnDateKey(new Date(now)) ? formatTime(recordedAt) : formatDateTime(recordedAt)

export function AttendanceListItem({ row, canMark, pending, now, onMark }: AttendanceListItemProps) {
  const record = row.record
  const name = row.person.fullName
  return (
    <motion.li variants={itemVariants} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{name}</span>
            {row.extra && <Badge tone="progress">Phát sinh</Badge>}
            {pending && <Spinner label={`Đang lưu trạng thái của ${name}`} className="text-primary" />}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{row.departmentName ? `Ban ${row.departmentName}` : 'Chưa có ban'}</span>
            <span aria-hidden>·</span>
            {record ? (
              <span className="inline-flex items-center gap-1">
                {record.method === 'QR' && <QrCode aria-hidden className="size-3.5" />}
                {record.method === 'QR' ? 'Quét QR' : `Ghi bởi ${record.recordedBy.fullName}`} lúc {recordedLabel(record.recordedAt, now)}
              </span>
            ) : (
              <span>Chưa điểm danh</span>
            )}
          </p>
        </div>
      </div>

      {canMark ? (
        <div role="group" aria-label={`Trạng thái của ${name}`} className="grid grid-cols-4 gap-1.5 sm:flex sm:shrink-0">
          {ATTENDANCE_STATUSES.map((status) => {
            const display = attendanceStatusDisplay[status]
            const selected = record?.status === status
            return (
              <button
                key={status}
                type="button"
                aria-pressed={selected}
                aria-label={display.label}
                disabled={pending}
                onClick={() => !selected && onMark(status)}
                className={cn(
                  'inline-flex h-11 min-w-0 items-center justify-center rounded-lg border px-2.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-wait disabled:opacity-60 sm:h-9 sm:min-w-16 pointer-coarse:h-11',
                  selected ? cn(toneVariants({ tone: display.tone }), 'border-transparent') : 'bg-card text-muted-foreground hover:border-input/70 hover:text-foreground',
                )}
              >
                {display.short}
              </button>
            )
          })}
        </div>
      ) : record ? (
        <Badge tone={attendanceStatusDisplay[record.status].tone} dot className="self-start sm:self-center">
          {attendanceStatusDisplay[record.status].label}
        </Badge>
      ) : (
        <Badge tone="neutral" className="self-start sm:self-center">
          Chưa điểm danh
        </Badge>
      )}
    </motion.li>
  )
}

import { motion } from 'motion/react'
import { getErrorMessage } from '@/api/apiError'
import { Clock, Info, Lock, QrCode, UserPlus, UsersRound } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { listVariants } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { attendanceFilters, attendanceNotice, closeConfirmText, dayLabel } from '../viewModel/attendanceDisplay'
import { useAttendanceViewModel } from '../viewModel/useAttendanceViewModel'
import { AddExtraDialog } from './AddExtraDialog'
import { AttendanceQrDialog } from './AttendanceQrDialog'
import { AttendanceListItem } from './AttendanceListItem'

const noticeStyle = {
  OPEN: { icon: Info, className: 'bg-primary-soft text-on-primary-soft' },
  NOT_OPEN: { icon: Clock, className: 'bg-status-info-soft text-status-info' },
  CLOSED: { icon: Lock, className: 'bg-muted text-muted-foreground' },
  READ_ONLY: { icon: Lock, className: 'bg-muted text-muted-foreground' },
} as const

/** Bảng điểm danh dùng chung cho buổi sinh hoạt và sự kiện (FR-ATT-05, 07, phần chốt của FR-ATT-08). */
export function AttendancePanel({ activity }: { activity: AttendanceActivityRef }) {
  const vm = useAttendanceViewModel(activity)
  const sheet = vm.sheet

  if (vm.loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Đang tải điểm danh">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }
  if (!sheet || !vm.window) return <ErrorState error={vm.error} onRetry={vm.refetch} />

  const notice = noticeStyle[vm.window]
  const NoticeIcon = notice.icon
  const filtered = vm.keyword !== '' || vm.filter !== ''

  return (
    <div className="space-y-4">
      <p role="status" className={cn('flex items-start gap-2 rounded-xl p-3 text-sm font-medium', notice.className)}>
        <NoticeIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {attendanceNotice(sheet, vm.now)}
      </p>

      {vm.days.length > 1 && (
        <div role="group" aria-label="Ngày của sự kiện" className="flex flex-wrap gap-2">
          {vm.days.map((day, index) => (
            <FilterChip key={day} label={dayLabel(day, index)} selected={vm.day === day} onToggle={() => vm.setDay(day)} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput label="Tìm người trong danh sách" placeholder="Tìm theo họ tên…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-sm sm:flex-1" />
        {(vm.canMark || vm.canShowQr || vm.canClose) && (
          <div className="flex flex-wrap gap-2">
            {vm.canShowQr && (
              <Button variant="outline" onClick={() => vm.setQrOpen(true)}>
                <QrCode aria-hidden />
                Mã QR
              </Button>
            )}
            {vm.canMark && (
              <Button variant="outline" onClick={() => vm.setExtraOpen(true)}>
                <UserPlus aria-hidden />
                Thêm người phát sinh
              </Button>
            )}
            {vm.canClose && (
              <Button onClick={vm.openClose}>
                <Lock aria-hidden />
                Chốt điểm danh
              </Button>
            )}
          </div>
        )}
      </div>

      <div role="group" aria-label="Lọc theo trạng thái điểm danh" className="flex flex-wrap gap-2">
        {attendanceFilters(sheet.counts).map((item) => (
          <FilterChip key={item.value || 'ALL'} label={item.label} count={item.count} selected={vm.filter === item.value} onToggle={() => vm.setFilter(item.value)} />
        ))}
      </div>

      <ConflictBanner show={vm.conflict} onReload={vm.reloadAfterConflict} />
      {vm.error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-status-danger">
          Không tải lại được danh sách mới nhất: {getErrorMessage(vm.error)}
          <Button variant="link" size="sm" onClick={vm.refetch}>
            Thử lại
          </Button>
        </p>
      )}

      {sheet.rows.content.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={filtered ? 'Không có ai phù hợp' : 'Danh sách đang trống'}
          description={filtered ? 'Thử từ khóa hoặc bộ lọc khác.' : activity.type === 'EVENT' ? 'Chưa có ai nhận chỗ ở sự kiện này.' : 'Buổi này chưa có thành viên nào trong phạm vi.'}
        />
      ) : (
        <motion.ul key={`${sheet.day}-${vm.filter}-${vm.page}`} variants={listVariants} initial="initial" animate="animate" className="space-y-2">
          {sheet.rows.content.map((row) => (
            <AttendanceListItem
              key={row.person.id}
              row={row}
              canMark={vm.canMark}
              pending={vm.pendingUserIds.has(row.person.id)}
              now={vm.now}
              onMark={(status) => void vm.markStatus({ userId: row.person.id, fullName: row.person.fullName, status, version: row.record?.version ?? 0 })}
            />
          ))}
        </motion.ul>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />

      <p role="status" aria-atomic="true" className="sr-only">
        {vm.announcement}
      </p>

      <AddExtraDialog activity={activity} vm={vm} />
      <AttendanceQrDialog activity={activity} vm={vm} />
      <ConfirmDialog
        open={vm.closeOpen}
        onOpenChange={vm.setCloseOpen}
        title="Chốt điểm danh?"
        description={closeConfirmText(sheet.counts)}
        confirmLabel="Chốt điểm danh"
        pending={vm.closePending}
        onConfirm={vm.confirmClose}
      >
        <FormAlert message={vm.closeError} />
      </ConfirmDialog>
    </div>
  )
}

import { CalendarDays, CalendarX2, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { formatLongDate, formatTimeRange } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { NativeSelect } from '@/shared/ui/Input'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { CalendarItem } from '../model/calendarTypes'
import { itemKindLabel, itemPath, relationDisplay, WEEKDAY_LABELS } from '../viewModel/calendarDisplay'
import { useCalendarViewModel } from '../viewModel/useCalendarViewModel'

const kindStyle = {
  SESSION: { border: 'border-l-primary', chip: 'bg-primary-soft text-on-primary-soft' },
  EVENT: { border: 'border-l-status-progress', chip: 'bg-status-progress-soft text-status-progress' },
} as const

/** Ô nhỏ trong lưới tháng; tên đầy đủ nằm ở nhãn truy cập. */
function GridChip({ item }: { item: CalendarItem }) {
  return (
    <Link
      to={itemPath(item)}
      aria-label={`${itemKindLabel(item)}: ${item.title}, ${formatTimeRange(item.startAt, item.endAt)}, ${item.clubName}${item.cancelled ? ', đã hủy' : ''}`}
      className={cn(
        'block truncate rounded-md border-l-4 px-1.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80',
        kindStyle[item.type].border,
        item.cancelled ? 'bg-muted text-muted-foreground line-through' : kindStyle[item.type].chip,
      )}
    >
      {item.title}
    </Link>
  )
}

function AgendaItem({ item }: { item: CalendarItem }) {
  return (
    <li>
      <Link to={itemPath(item)} className={cn('block space-y-1.5 rounded-xl border border-l-4 bg-card p-3 shadow-sm', kindStyle[item.type].border)}>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={item.type === 'SESSION' ? 'info' : 'progress'}>{itemKindLabel(item)}</Badge>
          {item.cancelled && <Badge tone="danger">Đã hủy</Badge>}
          {item.relations.map((relation) => (
            <Badge key={relation} tone={relationDisplay[relation].tone}>
              {relationDisplay[relation].label}
            </Badge>
          ))}
        </span>
        <span className={cn('block font-bold', item.cancelled && 'text-muted-foreground line-through')}>{item.title}</span>
        <span className="block text-sm text-muted-foreground">
          {formatTimeRange(item.startAt, item.endAt)} · {item.clubName}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{item.location}</span>
        </span>
      </Link>
    </li>
  )
}

/** FR-ATT-09: lịch hoạt động của tôi; lưới tháng từ 768 px, danh sách theo ngày ở màn hẹp. */
export function CalendarPage() {
  const vm = useCalendarViewModel()

  return (
    <div>
      <PageHeader title="Lịch của tôi" description="Buổi sinh hoạt và sự kiện ở mọi CLB bạn tham gia." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={vm.previous} aria-label="Tháng trước">
            <ChevronLeft aria-hidden />
          </Button>
          <h2 aria-live="polite" className="min-w-32 text-center text-lg font-bold tabular-nums sm:min-w-36">
            {vm.monthLabel}
          </h2>
          <Button variant="outline" size="icon" onClick={vm.next} aria-label="Tháng sau">
            <ChevronRight aria-hidden />
          </Button>
          {!vm.isCurrentMonth && (
            <Button variant="ghost" size="sm" onClick={vm.goToday}>
              Tháng này
            </Button>
          )}
        </div>
        <NativeSelect aria-label="Lọc theo CLB" value={vm.clubId} onChange={(event) => vm.setClubId(event.target.value)} className="sm:w-64">
          <option value="">Mọi CLB</option>
          {vm.clubs.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {vm.loading ? (
        <div role="status" aria-label="Đang tải lịch">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : (
        <>
          <div className={cn('hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block', vm.fetching && 'opacity-70')}>
            <div className="grid grid-cols-7 border-b bg-muted/50">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-2 py-2 text-center text-xs font-bold text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
            <ol aria-label={`Lịch ${vm.monthLabel.toLowerCase()}`} className="grid grid-cols-7">
              {vm.days.map((day) => {
                const items = vm.byDay.get(day) ?? []
                const inMonth = day.startsWith(vm.month)
                return (
                  <li key={day} className={cn('min-h-28 space-y-1 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-muted/30')}>
                    <span
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                        day === vm.today ? 'bg-primary text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <span className="sr-only">{formatLongDate(`${day}T12:00:00+07:00`)}</span>
                      <span aria-hidden>{Number(day.slice(8))}</span>
                    </span>
                    {items.map((item) => (
                      <GridChip key={`${item.type}-${item.id}`} item={item} />
                    ))}
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="md:hidden">
            {vm.agenda.length === 0 ? (
              <EmptyState icon={CalendarX2} title="Tháng này chưa có hoạt động" description="Đổi tháng hoặc bỏ lọc CLB để xem thêm." />
            ) : (
              <ol className="space-y-5">
                {vm.agenda.map(({ day, items }) => (
                  <li key={day} className="space-y-2">
                    <h3 className={cn('flex items-center gap-2 text-sm font-bold', day === vm.today && 'text-primary')}>
                      <CalendarDays aria-hidden className="size-4" />
                      {formatLongDate(`${day}T12:00:00+07:00`)}
                      {day === vm.today && <span className="text-xs font-semibold">(hôm nay)</span>}
                    </h3>
                    <ul className="space-y-2">
                      {items.map((item) => (
                        <AgendaItem key={`${item.type}-${item.id}`} item={item} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {vm.empty && <p className="mt-4 hidden text-center text-sm text-muted-foreground md:block">Tháng này chưa có hoạt động nào.</p>}
        </>
      )}
    </div>
  )
}

import { motion } from 'motion/react'
import { CalendarPlus, CalendarX2, Lightbulb } from 'lucide-react'
import { listVariants } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { useEventListViewModel } from '../viewModel/useEventListViewModel'
import { EventCard } from './EventCard'
import { EventFormSheet } from './EventFormSheet'

export function EventListPage() {
  const vm = useEventListViewModel()

  return (
    <div>
      <PageHeader
        eyebrow={vm.clubName}
        title="Sự kiện"
        description="Sự kiện của CLB, từ đề xuất đến khi đóng."
        actions={
          vm.formMode && (
            <Button onClick={() => vm.setFormOpen(true)}>
              {vm.formMode === 'create' ? <CalendarPlus aria-hidden /> : <Lightbulb aria-hidden />}
              {vm.formMode === 'create' ? 'Tạo sự kiện' : 'Đề xuất sự kiện'}
            </Button>
          )
        }
      />

      <div className="mb-5 space-y-3">
        <SearchInput label="Tìm sự kiện" placeholder="Tìm theo tên, địa điểm…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-md" />
        <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
          {vm.filters.map((filter) => (
            <FilterChip key={filter.key} label={filter.label} selected={vm.filterKey === filter.key} onToggle={() => vm.setFilterKey(filter.key)} />
          ))}
        </div>
      </div>

      {vm.loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải sự kiện">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-80 rounded-2xl" />
          ))}
        </div>
      )}
      {vm.error && <ErrorState error={vm.error} onRetry={vm.refetch} />}
      {!vm.loading && !vm.error && vm.events.length === 0 && (
        <EmptyState icon={CalendarX2} title="Chưa có sự kiện phù hợp" description={vm.keyword ? 'Thử từ khóa khác.' : 'Chưa có sự kiện nào ở nhóm này.'} />
      )}
      {!vm.loading && vm.events.length > 0 && (
        <motion.ul
          key={`${vm.filterKey}-${vm.page}`}
          variants={listVariants}
          initial="initial"
          animate="animate"
          className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {vm.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </motion.ul>
      )}
      <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />

      {vm.formMode && <EventFormSheet clubId={vm.clubId} clubName={vm.clubName} mode={vm.formMode} open={vm.formOpen} onOpenChange={vm.setFormOpen} />}
    </div>
  )
}

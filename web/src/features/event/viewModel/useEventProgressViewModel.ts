import { useQuery } from '@tanstack/react-query'
import { eventRepository } from '../model/eventRepository'
import type { TaskProgressCounts } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

/** Phần trăm việc Hoàn thành, làm tròn xuống để 99,6% không hiện thành 100% khi còn việc dở; không có việc thì null. */
export function donePercent(counts: Pick<TaskProgressCounts, 'total' | 'done'>): number | null {
  if (counts.total === 0) return null
  return Math.floor((counts.done / counts.total) * 100)
}

/** Câu tóm tắt một tiểu ban, ví dụ "3/5 việc hoàn thành · 1 quá hạn". */
export function progressSummary(counts: TaskProgressCounts): string {
  if (counts.total === 0) return 'Chưa có việc'
  const overdue = counts.overdue > 0 ? ` · ${counts.overdue} quá hạn` : ''
  return `${counts.done}/${counts.total} việc hoàn thành${overdue}`
}

/** FR-EVT-09: tiến độ sự kiện theo tiểu ban. */
export function useEventProgressViewModel(clubId: string, eventId: string) {
  const progress = useQuery({ queryKey: eventQueryKeys.progress(clubId, eventId), queryFn: () => eventRepository.progress(clubId, eventId) })
  return {
    progress: progress.data ?? null,
    loading: progress.isPending,
    error: progress.error,
    refetch: () => void progress.refetch(),
  }
}

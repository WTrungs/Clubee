import { CalendarRange } from 'lucide-react'
import type { TermSummary } from '@/features/club/model/clubTypes'
import { formatDate } from '@/shared/format/formatDate'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { Position } from '../model/orgTypes'
import { PositionList } from './PositionList'

interface BoardBlockProps {
  clubName: string
  term: TermSummary | null
  board: Position[]
  loading: boolean
  error: unknown
  onRevoke: (position: Position) => void
}

/** Khối gốc của cơ cấu: CLB, nhiệm kỳ đang chạy và ban chủ nhiệm (FR-ORG-07). */
export function BoardBlock({ clubName, term, board, loading, error, onRevoke }: BoardBlockProps) {
  return (
    <section aria-label="Ban chủ nhiệm" className="rounded-2xl bg-brand p-5 text-brand-foreground shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-foreground/75">
        <CalendarRange aria-hidden className="size-3.5" />
        {term
          ? `${term.name} · ${formatDate(term.startOn)} – ${formatDate(term.endOn)}${term.status === 'HANDING_OVER' ? ' · Đang bàn giao' : ''}`
          : 'Chưa có nhiệm kỳ đang chạy'}
      </p>
      <h3 className="mt-1 text-xl font-bold">{clubName}</h3>
      <p className="mt-3 mb-2 text-xs font-bold tracking-wider text-brand-foreground/75 uppercase">Ban chủ nhiệm</p>
      {loading && <Skeleton className="h-16 w-full bg-brand-foreground/15" />}
      {Boolean(error) && <ErrorState error={error} className="rounded-xl bg-card text-card-foreground" />}
      {!loading && !error && board.length === 0 && <p className="text-sm text-brand-foreground/75">Chưa gán ban chủ nhiệm.</p>}
      {!loading && !error && board.length > 0 && <PositionList positions={board} show="holder" onRevoke={onRevoke} tone="brand" />}
    </section>
  )
}

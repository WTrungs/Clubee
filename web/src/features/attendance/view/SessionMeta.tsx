import { formatDate } from '@/shared/format/formatDate'
import { useNow } from '@/shared/hooks/useNow'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import type { SessionSummary } from '../model/sessionTypes'
import { sessionTiming, sessionTimingDisplay } from '../viewModel/sessionDisplay'

export function SessionTimingBadge({ session }: { session: Pick<SessionSummary, 'startAt' | 'endAt' | 'attendanceClosed'> }) {
  const now = useNow(30_000)
  const display = sessionTimingDisplay[sessionTiming(session, now)]
  return (
    <Badge tone={display.tone} dot>
      {display.label}
    </Badge>
  )
}

/** Khối ngày đầu dòng: tháng và ngày của buổi. */
export function SessionDateBlock({ startAt, className }: { startAt: string; className?: string }) {
  const [day, month] = formatDate(startAt).split('/')
  return (
    <span aria-hidden className={cn('inline-flex w-14 shrink-0 flex-col items-center self-start rounded-xl bg-primary-soft py-1.5 text-on-primary-soft', className)}>
      <span className="text-2xs font-bold tracking-wide uppercase">Th {Number(month)}</span>
      <span className="text-xl leading-none font-extrabold tabular-nums">{day}</span>
    </span>
  )
}

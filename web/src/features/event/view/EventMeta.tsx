import { Globe2, MapPin } from 'lucide-react'
import { formatDate } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/Badge'
import type { EventStatus, EventSummary, RegistrationStatus } from '../model/eventTypes'
import { eventStatusDisplay, registrationStatusDisplay } from '../viewModel/eventDisplay'

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const display = eventStatusDisplay[status]
  return (
    <Badge tone={display.tone} dot>
      {display.label}
    </Badge>
  )
}

export function RegistrationBadge({ status, waitlistPosition }: { status: RegistrationStatus; waitlistPosition: number | null }) {
  const display = registrationStatusDisplay[status]
  return (
    <Badge tone={display.tone}>
      {display.label}
      {status === 'WAITLISTED' && waitlistPosition ? ` · #${waitlistPosition}` : ''}
    </Badge>
  )
}

export function EventPlace({ event, className }: { event: Pick<EventSummary, 'format' | 'location'>; className?: string }) {
  const online = event.format === 'ONLINE'
  const Icon = online ? Globe2 : MapPin
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{online ? 'Trực tuyến' : event.location}</span>
    </span>
  )
}

/** Khối ngày nổi bật trên ảnh bìa: ngày và tháng của buổi bắt đầu. */
export function DateBlock({ startAt, className }: { startAt: string; className?: string }) {
  const [day, month] = formatDate(startAt).split('/')
  return (
    <span className={cn('inline-flex w-14 flex-col items-center rounded-xl bg-card py-1.5 text-card-foreground shadow-md', className)}>
      <span className="text-2xs font-bold tracking-wide text-primary uppercase">Th {Number(month)}</span>
      <span className="text-xl leading-none font-extrabold tabular-nums">{day}</span>
    </span>
  )
}

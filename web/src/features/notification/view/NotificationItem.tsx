import { BadgeCheck, CalendarCheck, CalendarDays, CalendarRange, ClipboardList, Megaphone, UserPlus, Wallet, type LucideIcon } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { cn } from '@/shared/lib/cn'
import { toneVariants } from '@/shared/ui/tone'
import type { NotificationCategory, NotificationSummary } from '../model/notificationTypes'
import { notificationCategoryDisplay } from '../viewModel/notificationDisplay'

const categoryIcon: Record<NotificationCategory, LucideIcon> = {
  ANNOUNCEMENT: Megaphone,
  TASK: ClipboardList,
  EVENT: CalendarDays,
  SESSION: CalendarCheck,
  FINANCE: Wallet,
  POSITION: BadgeCheck,
  TERM: CalendarRange,
  RECRUITMENT: UserPlus,
  MEMBERSHIP: UserPlus,
}

export function NotificationItem({ item, onOpen }: { item: NotificationSummary; onOpen: (item: NotificationSummary) => void }) {
  const display = notificationCategoryDisplay[item.category]
  const Icon = categoryIcon[item.category]
  const unread = item.readAt === null
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted',
        unread && 'bg-primary-soft/40',
      )}
    >
      <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', toneVariants({ tone: display.tone }))}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm break-words', unread ? 'font-bold' : 'font-medium')}>
          {unread && <span className="sr-only">Chưa đọc: </span>}
          {item.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {display.label}
          {item.clubName ? ` · ${item.clubName}` : ''} · {formatDateTime(item.createdAt)}
        </span>
      </span>
      {unread && <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}

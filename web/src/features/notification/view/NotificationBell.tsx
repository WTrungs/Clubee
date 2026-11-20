import { Bell } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/shared/lib/cn'
import { unreadBadge } from '../viewModel/notificationDisplay'
import { useUnreadCount } from '../viewModel/useUnreadCount'

/** Lối vào hộp thông báo (FR-NOT-03); là liên kết thay cho popover vì ở 360 px không đủ chỗ. */
export function NotificationBell() {
  const unread = useUnreadCount()
  const count = unread.data?.count ?? 0
  const badge = unreadBadge(count)
  return (
    <NavLink
      to="/notifications"
      aria-label={count > 0 ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
      className={({ isActive }) =>
        cn(
          'relative inline-flex size-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted',
          isActive && 'bg-muted',
        )
      }
    >
      <Bell aria-hidden className="size-5" />
      {badge && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-2xs leading-none font-bold text-destructive-foreground tabular-nums ring-2 ring-card"
        >
          {badge}
        </span>
      )}
    </NavLink>
  )
}

import { cn } from '@/shared/lib/cn'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import type { Position } from '../model/orgTypes'
import { positionPeriod, positionTitle } from '../viewModel/orgDisplay'

interface PositionListProps {
  positions: Position[]
  /** Hiện tên chức vụ thay cho tên người, khi danh sách đã là của một người. */
  show: 'holder' | 'title'
  onRevoke: (position: Position) => void
  tone?: 'default' | 'brand'
}

/** Chức vụ đang hoặc sắp có hiệu lực kèm thời hạn; nút Thu hồi chỉ hiện khi máy chủ cho phép. */
export function PositionList({ positions, show, onRevoke, tone = 'default' }: PositionListProps) {
  const muted = tone === 'brand' ? 'text-brand-foreground/75' : 'text-muted-foreground'
  return (
    <ul className="space-y-2">
      {positions.map((position) => (
        <li key={position.id} className="flex items-center gap-3">
          {show === 'holder' && <Avatar name={position.holder.fullName} size="sm" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{show === 'holder' ? position.holder.fullName : positionTitle(position)}</p>
            <p className={cn('text-xs', muted)}>
              {show === 'holder' ? `${positionTitle(position)} · ` : ''}
              {positionPeriod(position)}
              {position.status === 'UPCOMING' && <span className="font-semibold"> (chưa hiệu lực)</span>}
            </p>
          </div>
          {position.allowedActions.includes('REVOKE') && (
            <Button size="sm" variant={tone === 'brand' ? 'secondary' : 'outline'} onClick={() => onRevoke(position)} aria-label={`Thu hồi ${positionTitle(position)} của ${position.holder.fullName}`}>
              Thu hồi
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

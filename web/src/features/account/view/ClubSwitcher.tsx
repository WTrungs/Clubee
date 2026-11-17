import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/cn'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu'
import { useClubSwitcherViewModel } from '../viewModel/useClubSwitcherViewModel'
import { ClubMonogram } from './ClubMonogram'

/** Tên CLB hiện hành luôn hiện ở đầu trang, bấm để chuyển CLB (FR-ACC-06, IF-01). */
export function ClubSwitcher({ routeClubId, className }: { routeClubId: string | undefined; className?: string }) {
  const vm = useClubSwitcherViewModel(routeClubId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'group flex h-11 min-w-0 items-center gap-2.5 rounded-xl border bg-card/70 py-1 pr-2 pl-1.5 text-left shadow-sm transition-colors hover:border-input/60 hover:bg-card',
          className,
        )}
        aria-label={vm.current ? `CLB hiện hành: ${vm.current.clubName}. Bấm để chuyển CLB` : 'Chọn CLB'}
      >
        {/* Dưới 400 px header còn chuông, nút giao diện, tài khoản nên bỏ biểu tượng để tên CLB đủ chỗ (IF-01). */}
        {vm.current ? (
          <ClubMonogram clubId={vm.current.clubId} shortName={vm.current.shortName} logoUrl={vm.current.logoUrl} className="size-8 rounded-lg text-2xs max-[399px]:hidden" />
        ) : (
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground max-[399px]:hidden">
            <LayoutGrid aria-hidden className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="hidden text-2xs leading-tight font-semibold text-muted-foreground sm:block">{vm.inClubRoute ? 'CLB hiện hành' : 'CLB gần nhất'}</span>
          {/* Two lines on narrow screens so the current club name stays readable (IF-01). */}
          <span className="line-clamp-2 text-sm leading-tight font-bold sm:line-clamp-1">{vm.current?.clubName ?? 'Chưa chọn CLB'}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Chuyển CLB</DropdownMenuLabel>
        {vm.memberships.map((membership) => (
          <DropdownMenuItem key={membership.clubId} onSelect={() => vm.select(membership.clubId)}>
            <ClubMonogram clubId={membership.clubId} shortName={membership.shortName} logoUrl={membership.logoUrl} className="size-7 rounded-lg text-2xs" />
            <span className="min-w-0 flex-1 truncate">{membership.clubName}</span>
            {membership.clubId === vm.current?.clubId && <Check aria-label="Đang chọn" className="text-primary!" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/clubs">
            <LayoutGrid aria-hidden />
            Tất cả CLB của tôi
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

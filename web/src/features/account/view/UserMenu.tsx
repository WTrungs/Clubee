import { BellRing, LogOut, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar } from '@/shared/ui/Avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu'
import { Spinner } from '@/shared/ui/Spinner'
import { useCurrentUser, useLogout } from '../viewModel/useSession'

export function UserMenu() {
  const user = useCurrentUser()
  const { logout, pending } = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-11 items-center justify-center rounded-full transition-transform hover:scale-105"
        aria-label={`Tài khoản: ${user.fullName}`}
      >
        <Avatar name={user.fullName} imageUrl={user.avatarUrl} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <Avatar name={user.fullName} imageUrl={user.avatarUrl} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-foreground">{user.fullName}</span>
            <span className="block truncate text-xs font-medium">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/me/profile">
            <UserRound aria-hidden />
            Hồ sơ cá nhân
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/me/notification-settings">
            <BellRing aria-hidden />
            Tùy chọn thông báo
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          destructive
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault()
            logout()
          }}
        >
          {pending ? <Spinner /> : <LogOut aria-hidden />}
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

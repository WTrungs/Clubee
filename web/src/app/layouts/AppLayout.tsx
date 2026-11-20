import { AnimatePresence, motion } from 'motion/react'
import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, ScrollRestoration, useLocation, useMatch, useOutlet } from 'react-router'
import { ClubSwitcher } from '@/features/account/view/ClubSwitcher'
import { UserMenu } from '@/features/account/view/UserMenu'
import { homeOf } from '@/features/account/viewModel/redirect'
import { pickGuestClub } from '@/features/account/viewModel/useClubSwitcherViewModel'
import { useCurrentUser } from '@/features/account/viewModel/useSession'
import { NotificationBell } from '@/features/notification/view/NotificationBell'
import { cn } from '@/shared/lib/cn'
import { pageVariants, spring } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { Logo } from '@/shared/ui/Logo'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { buildNavigation, type NavSection } from '../navigation'
import { ThemeToggle } from '../ThemeToggle'

function NavList({ sections, indicatorId, onNavigate }: { sections: NavSection[]; indicatorId: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Điều hướng chính" className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 truncate px-3 text-2xs font-bold tracking-wider text-muted-foreground uppercase">{section.title}</p>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
                      isActive ? 'text-on-primary-soft' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId={indicatorId} transition={spring} className="absolute inset-0 rounded-xl bg-primary-soft" />}
                      <item.icon aria-hidden className="relative size-5" />
                      <span className="relative truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const clubMatch = useMatch('/clubs/:clubId/*')
  const routeClubId = clubMatch?.params.clubId
  const user = useCurrentUser()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Người ngoài CLB đang làm BTC một sự kiện của CLB này là khách (FR-EVT-07); máy chủ vẫn tự kiểm từng trang.
  const guestClub = pickGuestClub(user.memberships, user.staffEvents, routeClubId)
  const clubName = guestClub?.clubName ?? user.memberships.find((membership) => membership.clubId === routeClubId)?.clubName
  const sections = buildNavigation(routeClubId, clubName, user.accountType, guestClub ? 'EVENT_GUEST' : 'MEMBER')
  const admin = user.accountType === 'ADMIN'
  const home = homeOf(user.accountType)

  return (
    <div className="relative min-h-dvh">
      <ScrollRestoration />
      <a
        href="#main"
        className="sr-only z-60 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Bỏ qua điều hướng
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
        <Link to={home} className="flex h-16 items-center px-5" aria-label={admin ? 'Clubee, về trang quản trị' : 'Clubee, về danh sách CLB'}>
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList sections={sections} indicatorId="nav-desktop" />
        </div>
      </aside>

      <div className="relative lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-card">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Mở menu" onClick={() => setDrawerOpen(true)}>
              <Menu aria-hidden />
            </Button>
            {admin ? (
              <p className="truncate text-sm font-semibold">Quản trị hệ thống</p>
            ) : (
              <ClubSwitcher routeClubId={routeClubId} className="w-full max-w-xs flex-1 sm:flex-none" />
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" title="Menu" hideHeader>
          <div className="flex h-16 items-center border-b px-5">
            <Logo />
          </div>
          <div className="px-3 py-4">
            <NavList sections={sections} indicatorId="nav-mobile" onNavigate={() => setDrawerOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

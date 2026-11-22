import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Link, ScrollRestoration, useLocation, useOutlet } from 'react-router'
import { homeOf } from '@/features/account/viewModel/redirect'
import { useSession } from '@/features/account/viewModel/useSession'
import { pageVariants } from '@/shared/motion/presets'
import { Button } from '@/shared/ui/Button'
import { LogoMark } from '@/shared/ui/Logo'
import { ThemeToggle } from '../ThemeToggle'

/** Khung trang công khai (FR-CLB-05): không cần đăng nhập; người đã đăng nhập có lối quay về ứng dụng. */
export function PublicLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const session = useSession()
  const user = session.data

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link to="/explore" className="inline-flex min-w-0 items-center gap-2.5" aria-label="Clubee: danh bạ CLB">
            <LogoMark />
            <span className="hidden text-lg font-extrabold tracking-tight sm:inline">
              Club<span className="text-primary">ee</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            {session.isPending ? null : user ? (
              <Button asChild size="sm">
                <Link to={homeOf(user.accountType)}>
                  Vào ứng dụng
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>
                    Đăng nhập
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Đăng ký</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <AnimatePresence mode="wait" initial={false}>
          {outlet && (
            <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {outlet}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <ScrollRestoration />
    </div>
  )
}

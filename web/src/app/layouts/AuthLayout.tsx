import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck2, KanbanSquare, UsersRound, Wallet } from "lucide-react";
import { Link, useLocation, useOutlet } from "react-router";
import {
  duration,
  easeOut,
  itemVariants,
  listVariants,
  pageVariants,
} from "@/shared/motion/presets";
import { Badge } from "@/shared/ui/Badge";
import { Logo } from "@/shared/ui/Logo";
import { ThemeToggle } from "../ThemeToggle";

const highlights = [
  {
    icon: UsersRound,
    title: "Quản lý thành viên",
    text: "Cơ cấu ban, chức vụ",
  },
  {
    icon: CalendarCheck2,
    title: "Quản lý sự kiện",
    text: "Ban tổ chức, đăng ký, điểm danh",
  },
  {
    icon: KanbanSquare,
    title: "Quản lý công việc CLB",
    text: "Người phụ trách, deadline, trạng thái công việc",
  },
  {
    icon: Wallet,
    title: "Quản lý quỹ minh bạch",
    text: "Thu chi, tạm ứng, đợt đóng quỹ",
  },
];

function FloatingPreview() {
  return (
    <div aria-hidden className="relative mx-auto h-64 w-full max-w-sm">
      <motion.div
        className="absolute top-0 left-0 w-64 rounded-2xl bg-card p-4 text-card-foreground"
        initial={{ opacity: 0, y: 12, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -4 }}
        transition={{ duration: duration.slow, delay: 0.1, ease: easeOut }}
      >
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Sự kiện
        </p>
        <p className="mt-1 font-bold">Đêm nhạc Mùa đông</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[82%] rounded-full bg-primary" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          123/150 chỗ đã được đăng ký
        </p>
      </motion.div>
      <motion.div
        className="absolute top-30 right-0 w-60 rounded-2xl bg-card p-4 text-card-foreground"
        initial={{ opacity: 0, y: 12, rotate: 3 }}
        animate={{ opacity: 1, y: 0, rotate: 3 }}
        transition={{ duration: duration.slow, delay: 0.18, ease: easeOut }}
      >
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Công việc
        </p>
        <p className="mt-1 font-bold">Thiết kế poster</p>
        <Badge tone="warning" dot className="mt-2">
          Chờ nghiệm thu
        </Badge>
      </motion.div>
    </div>
  );
}

export function AuthLayout() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between bg-brand p-10 text-brand-foreground lg:flex xl:p-14">
        <div className="inline-flex items-center gap-2.5 text-lg font-extrabold">
          Clubee
        </div>
        <div className="space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: easeOut }}
          >
            <h2 className="max-w-md text-4xl leading-tight font-extrabold tracking-tight text-balance">
              Mọi hoạt động của CLB gói gọn trong một nơi
            </h2>
          </motion.div>
          <FloatingPreview />
          <motion.ul
            variants={listVariants}
            initial="initial"
            animate="animate"
            className="grid max-w-lg grid-cols-2 gap-4"
          >
            {highlights.map(({ icon: Icon, title, text }) => (
              <motion.li
                key={title}
                variants={itemVariants}
                className="flex gap-3"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-foreground/10">
                  <Icon aria-hidden className="size-4.5" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-sm opacity-90">{text}</span>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
        <p className="text-sm opacity-80"></p>
      </aside>

      <main className="flex min-h-dvh flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-2">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-1">
            <Link to="/explore" className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Danh bạ CLB
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">
            <AnimatePresence mode="wait" initial={false}>
              {outlet && (
                <motion.div
                  key={location.pathname}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {outlet}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

import { AnimatePresence, motion } from 'motion/react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from './Button'

interface ConflictBannerProps {
  show: boolean
  onReload: () => void
  message?: string
}

/** NFR-REL-03: dữ liệu đã bị người khác sửa; cho tải lại thay vì ghi đè. */
export function ConflictBanner({ show, onReload, message = 'Dữ liệu đã được người khác thay đổi. Tải lại để xem bản mới nhất rồi thao tác lại.' }: ConflictBannerProps) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="mb-4 flex flex-col gap-3 rounded-xl bg-status-warning-soft p-3 text-status-warning sm:flex-row sm:items-center">
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{message}</p>
            <Button size="sm" variant="outline" onClick={onReload} className="self-start sm:self-auto">
              <RefreshCw aria-hidden />
              Tải lại
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

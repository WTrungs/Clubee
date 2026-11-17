import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert } from 'lucide-react'

/** Lỗi chung của form (ví dụ sai mật khẩu), đặt ngay trên nút gửi; `details` là lý do theo từng dòng nếu có. */
export function FormAlert({ message, details = [] }: { message: string | null; details?: string[] }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-2 rounded-xl bg-status-danger-soft p-3 text-sm font-medium text-status-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p>{message}</p>
              {details.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 font-normal">
                  {details.map((detail, index) => (
                    <li key={`${index}-${detail}`}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

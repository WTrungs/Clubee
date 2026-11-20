import { AnimatePresence, motion } from 'motion/react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/shared/theme/themeContext'
import { Button } from '@/shared/ui/Button'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2 }}
          className="inline-flex"
        >
          {dark ? <Moon aria-hidden className="size-5" /> : <Sun aria-hidden className="size-5" />}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}

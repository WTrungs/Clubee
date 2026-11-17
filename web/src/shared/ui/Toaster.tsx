import { Toaster as Sonner } from 'sonner'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useTheme } from '@/shared/theme/themeContext'

/** Màn hẹp hiện toast ở đáy để không che chuông và menu tài khoản trên header. */
const MOBILE_OFFSET = { bottom: 'calc(16px + env(safe-area-inset-bottom))' }

export function Toaster() {
  const { theme } = useTheme()
  const narrow = useMediaQuery('(max-width: 639px)')
  return (
    <Sonner
      theme={theme}
      position={narrow ? 'bottom-center' : 'top-center'}
      mobileOffset={MOBILE_OFFSET}
      richColors
      closeButton
      toastOptions={{ className: 'font-sans', duration: 5000 }}
    />
  )
}

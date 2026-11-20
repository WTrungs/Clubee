import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '@/api/queryClient'
import { ThemeProvider } from '@/shared/theme/ThemeProvider'
import { Toaster } from '@/shared/ui/Toaster'
import { TooltipProvider } from '@/shared/ui/Tooltip'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

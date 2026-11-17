import { Dialog as SheetPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close

interface SheetContentProps extends Omit<ComponentProps<typeof SheetPrimitive.Content>, 'title'> {
  side?: 'left' | 'right'
  title: ReactNode
  description?: ReactNode
  hideHeader?: boolean
  footer?: ReactNode
  headerAside?: ReactNode
}

export function SheetContent({
  side = 'right',
  title,
  description,
  hideHeader,
  footer,
  headerAside,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
      <SheetPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col bg-popover text-popover-foreground shadow-xl focus:outline-none',
          side === 'right'
            ? 'right-0 border-l data-[state=closed]:animate-sheet-out-right data-[state=open]:animate-sheet-in-right sm:max-w-lg'
            : 'left-0 max-w-72 border-r data-[state=closed]:animate-sheet-out-left data-[state=open]:animate-sheet-in-left',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        {/* With hideHeader only the title is visually hidden; the close button stays visible so focus is never invisible. */}
        <div className={cn('flex items-start justify-between gap-3', hideHeader ? 'absolute top-3.5 right-4 z-10' : 'border-b px-5 py-4')}>
          <div className={cn('min-w-0 space-y-1', hideHeader && 'sr-only')}>
            <SheetPrimitive.Title className="text-lg leading-snug font-semibold tracking-tight">{title}</SheetPrimitive.Title>
            {description && <SheetPrimitive.Description className="text-sm text-muted-foreground">{description}</SheetPrimitive.Description>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerAside}
            <SheetPrimitive.Close
              className="-mr-2 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-11"
              aria-label="Đóng"
            >
              <X aria-hidden className="size-5" />
            </SheetPrimitive.Close>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

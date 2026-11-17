import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'

export const fieldBaseClass =
  'w-full rounded-lg border border-input/70 bg-card text-base text-foreground shadow-sm transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 hover:border-input focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15 sm:text-sm'

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldBaseClass, 'h-11 px-3.5', className)} {...props} />
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(fieldBaseClass, 'min-h-24 resize-y px-3.5 py-2.5 leading-relaxed', className)} {...props} />
}

export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className={cn('relative block', className)}>
      <select className={cn(fieldBaseClass, 'h-11 appearance-none pr-10 pl-3.5')} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  )
}

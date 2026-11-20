import { cn } from '@/shared/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand', className)}>
      <svg viewBox="0 0 32 32" className="size-6 fill-brand-foreground">
        <circle cx="12" cy="12.5" r="4" />
        <circle cx="21" cy="12.5" r="3" opacity=".75" />
        <path d="M5.5 25c.9-4 3.6-6.2 6.5-6.2s5.6 2.2 6.5 6.2z" />
        <path d="M18.6 19.4c.8-.4 1.6-.6 2.4-.6 2.3 0 4.4 1.8 5.1 5.2h-6.3c-.2-1.8-.6-3.3-1.2-4.6z" opacity=".75" />
      </svg>
    </span>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight">
        Club<span className="text-primary">ee</span>
      </span>
    </span>
  )
}

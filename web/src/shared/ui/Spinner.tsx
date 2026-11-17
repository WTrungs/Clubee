import { LoaderCircle } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center">
      <LoaderCircle aria-hidden className={cn('size-4 animate-spin', className)} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}

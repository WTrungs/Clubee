import type { ChangeEvent, ComponentProps } from 'react'
import { formatMoneyInput } from '@/shared/format/formatMoney'
import { cn } from '@/shared/lib/cn'
import { Input } from './Input'

/** Ô nhập tiền VND: bàn phím số, tự chèn dấu chấm hàng nghìn (NFR-USA-03). */
export function MoneyInput({ className, onChange, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.target.value = formatMoneyInput(event.target.value)
    onChange?.(event)
  }
  return (
    <span className={cn('relative block', className)}>
      <Input inputMode="numeric" autoComplete="off" placeholder="0" className="pr-9 tabular-nums" onChange={handleChange} {...props} />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
        đ
      </span>
    </span>
  )
}

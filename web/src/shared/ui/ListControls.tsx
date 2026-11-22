import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { formatNumber } from '@/shared/format/formatMoney'
import { Button } from './Button'
import { fieldBaseClass } from './Input'

interface SearchInputProps extends Omit<ComponentProps<'input'>, 'onChange' | 'value'> {
  value: string
  onValueChange: (value: string) => void
  label: string
}

export function SearchInput({ value, onValueChange, label, className, ...props }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(fieldBaseClass, 'h-11 pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden')}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Xóa từ khóa"
          onClick={() => onValueChange('')}
          className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}

interface FilterChipProps {
  selected: boolean
  onToggle: () => void
  label: string
  count?: number
}

export function FilterChip({ selected, onToggle, label, count }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      title={label}
      className={cn(
        // Nhãn do người dùng đặt (ví dụ tên vòng tuyển) có thể dài: chip không vượt bề ngang, nhãn cắt bằng dấu ba chấm.
        'inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors duration-200 pointer-coarse:h-10',
        selected ? 'border-primary bg-primary-soft text-on-primary-soft' : 'bg-card text-muted-foreground hover:border-input/70 hover:text-foreground',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 text-xs tabular-nums opacity-80">{count}</span>}
    </button>
  )
}

interface PaginationProps {
  page: number
  totalPages: number
  totalElements: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}

/** Phân trang khi danh sách dài (FR-RPT-01); page bắt đầu từ 0 như Spring Data. */
export function Pagination({ page, totalPages, totalElements, pageSize, onPageChange, className }: PaginationProps) {
  if (totalElements === 0) return null
  const from = page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, totalElements)
  return (
    <nav aria-label="Phân trang" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted-foreground">
        Hiển thị <span className="font-semibold text-foreground tabular-nums">{formatNumber(from)}–{formatNumber(to)}</span> trên{' '}
        <span className="font-semibold text-foreground tabular-nums">{formatNumber(totalElements)}</span>
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="iconSm" aria-label="Trang trước" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-16 text-center text-sm font-semibold tabular-nums" aria-current="page">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="iconSm" aria-label="Trang sau" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      )}
    </nav>
  )
}

import { cn } from '@/shared/lib/cn'
import { pickBySeed } from '@/shared/lib/pickBySeed'
import { toneVariants, type Tone } from './tone'

const tones: [Tone, ...Tone[]] = ['info', 'progress', 'success', 'warning', 'danger', 'neutral']

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  const last = words.at(-1)?.[0] ?? ''
  const first = words.length > 1 ? (words[0]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

const sizes = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const

interface AvatarProps {
  name: string
  imageUrl?: string | null
  size?: keyof typeof sizes
  className?: string
  /** Mặc định ẩn với trình đọc màn hình vì tên luôn được hiển thị cạnh avatar. */
  decorative?: boolean
}

export function Avatar({ name, imageUrl, size = 'md', className, decorative = true }: AvatarProps) {
  const common = cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-card', sizes[size], className)
  if (imageUrl) {
    return <img src={imageUrl} alt={decorative ? '' : name} className={cn(common, 'object-cover')} />
  }
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
      role={decorative ? undefined : 'img'}
      className={cn(common, toneVariants({ tone: pickBySeed(name, tones) }), 'font-bold')}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ names, max = 3, size = 'xs' }: { names: string[]; max?: number; size?: keyof typeof sizes }) {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((name) => (
        <Avatar key={name} name={name} size={size} />
      ))}
      {rest > 0 && (
        <span className={cn('inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card', sizes[size])}>
          +{rest}
        </span>
      )}
    </span>
  )
}

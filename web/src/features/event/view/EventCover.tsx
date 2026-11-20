import { cn } from '@/shared/lib/cn'
import { pickBySeed } from '@/shared/lib/pickBySeed'

const banners: [string, ...string[]] = ['bg-banner-1', 'bg-banner-2', 'bg-banner-3', 'bg-banner-4']

/** Ảnh bìa trang trí chọn theo mã sự kiện (chưa có ảnh thật): màu đặc, chữ trắng đặt lên vẫn đủ tương phản. */
export function EventCover({ seed, className, muted }: { seed: string; className?: string; muted?: boolean }) {
  return <span aria-hidden className={cn('block', muted ? 'bg-banner-muted' : pickBySeed(seed, banners), className)} />
}

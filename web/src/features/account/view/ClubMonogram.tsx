import { cn } from '@/shared/lib/cn'
import { pickBySeed } from '@/shared/lib/pickBySeed'
import { toneVariants, type Tone } from '@/shared/ui/tone'

const tones: [Tone, ...Tone[]] = ['info', 'progress', 'success', 'warning', 'danger']
const base = 'inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold tracking-tight'

/** Logo CLB nếu có, không thì ký hiệu từ tên viết tắt; màu cố định theo mã CLB để dễ nhận ra. Tên CLB luôn hiện cạnh bên nên ẩn với trình đọc màn hình. */
export function ClubMonogram({ clubId, shortName, logoUrl, className }: { clubId: string; shortName: string; logoUrl?: string | null; className?: string }) {
  if (logoUrl) return <img src={logoUrl} alt="" aria-hidden className={cn(base, 'border bg-card object-cover', className)} />
  return (
    <span aria-hidden className={cn(base, toneVariants({ tone: pickBySeed(clubId, tones) }), className)}>
      {shortName.slice(0, 3)}
    </span>
  )
}

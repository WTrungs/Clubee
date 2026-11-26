import { Newspaper } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

/** Ảnh bìa tin; chưa có ảnh thì là khối màu thương hiệu kèm biểu tượng. */
export function NewsCover({ imageUrl, className }: { imageUrl: string | null; className?: string }) {
  if (imageUrl) return <img src={imageUrl} alt="" className={cn('aspect-[16/9] w-full object-cover', className)} />
  return (
    <div aria-hidden className={cn('flex aspect-[16/9] w-full items-center justify-center bg-primary-soft text-on-primary-soft', className)}>
      <Newspaper className="size-10 opacity-70" />
    </div>
  )
}

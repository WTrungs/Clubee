import { Tabs as TabsPrimitive } from 'radix-ui'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { spring } from '@/shared/motion/presets'

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

interface TabItem {
  value: string
  label: ReactNode
  count?: number
}

interface TabsBarProps extends Omit<ComponentProps<typeof TabsPrimitive.List>, 'children'> {
  items: TabItem[]
  active: string
}

/** Thanh tab có vạch chỉ báo trượt theo tab đang chọn. */
export function TabsBar({ items, active, className, ...props }: TabsBarProps) {
  const indicatorId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  // Số đếm về sau làm tab rộng thêm, nên cũng cuộn lại khi số của tab đang chọn đổi.
  const activeCount = items.find((item) => item.value === active)?.count
  // Ở màn hẹp thanh tab cuộn ngang và ẩn thanh cuộn; đưa tab đang chọn vào tầm nhìn, chỉ cuộn trong thanh.
  useEffect(() => {
    const list = listRef.current
    const tab = list?.querySelector<HTMLElement>('[data-state="active"]')
    if (!list || !tab) return
    const listRect = list.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    if (tabRect.left < listRect.left) list.scrollLeft -= listRect.left - tabRect.left
    else if (tabRect.right > listRect.right) list.scrollLeft += tabRect.right - listRect.right
  }, [active, activeCount])
  return (
    <TabsPrimitive.List ref={listRef} className={cn('flex w-full gap-1 overflow-x-auto border-b [scrollbar-width:none]', className)} {...props}>
      {items.map((item) => (
        <TabsPrimitive.Trigger
          key={item.value}
          value={item.value}
          className="relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-foreground"
        >
          {item.label}
          {item.count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs leading-none font-semibold tabular-nums">{item.count}</span>
          )}
          {active === item.value && (
            <motion.span layoutId={indicatorId} transition={spring} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          )}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  )
}

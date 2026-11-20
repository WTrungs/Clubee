import { cva, type VariantProps } from 'class-variance-authority'

/** Nhóm màu trạng thái dùng chung cho mọi máy trạng thái ST-* (IF-01: trình bày thống nhất). */
export const toneVariants = cva('', {
  variants: {
    tone: {
      neutral: 'bg-status-neutral-soft text-status-neutral',
      info: 'bg-status-info-soft text-status-info',
      progress: 'bg-status-progress-soft text-status-progress',
      warning: 'bg-status-warning-soft text-status-warning',
      success: 'bg-status-success-soft text-status-success',
      danger: 'bg-status-danger-soft text-status-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export type Tone = NonNullable<VariantProps<typeof toneVariants>['tone']>

export const toneTextClass: Record<Tone, string> = {
  neutral: 'text-status-neutral',
  info: 'text-status-info',
  progress: 'text-status-progress',
  warning: 'text-status-warning',
  success: 'text-status-success',
  danger: 'text-status-danger',
}

export const toneDotClass: Record<Tone, string> = {
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
  progress: 'bg-status-progress',
  warning: 'bg-status-warning',
  success: 'bg-status-success',
  danger: 'bg-status-danger',
}

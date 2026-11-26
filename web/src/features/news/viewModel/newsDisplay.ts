import type { Tone } from '@/shared/ui/tone'
import type { NewsStatus } from '../model/newsTypes'

export const newsStatusDisplay: Record<NewsStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  PUBLISHED: { label: 'Đã xuất bản', tone: 'success' },
  HIDDEN: { label: 'Đã ẩn', tone: 'warning' },
}

export const NEWS_STATUS_FILTERS: NewsStatus[] = ['PUBLISHED', 'DRAFT', 'HIDDEN']

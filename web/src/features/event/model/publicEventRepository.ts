import { httpClient } from '@/api/httpClient'
import type { PublicEventDetail } from './eventTypes'

/** FR-CLB-07, FR-EVT-12: sự kiện mở cho khách, gọi được khi chưa đăng nhập. */
export const publicEventRepository = {
  get: (eventId: string) => httpClient.get<PublicEventDetail>(`/public/events/${encodeURIComponent(eventId)}`),
}

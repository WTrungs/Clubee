import { httpClient } from '@/api/httpClient'
import type { GuestPass, GuestRegistrationRequest, PublicEventDetail } from './eventTypes'

/** FR-CLB-07, FR-EVT-12: sự kiện mở cho khách và vé của khách mời, gọi được khi chưa đăng nhập. */
export const publicEventRepository = {
  get: (eventId: string) => httpClient.get<PublicEventDetail>(`/public/events/${encodeURIComponent(eventId)}`),
  registerGuest: (eventId: string, request: GuestRegistrationRequest) => httpClient.post<GuestPass>(`/public/events/${encodeURIComponent(eventId)}/guest-registrations`, request),
  pass: (code: string) => httpClient.get<GuestPass>(`/public/guest-passes/${encodeURIComponent(code)}`),
  cancelPass: (code: string) => httpClient.post<GuestPass>(`/public/guest-passes/${encodeURIComponent(code)}/cancellation`),
}

import { httpClient } from '@/api/httpClient'
import type {
  AttendanceActivityRef,
  AttendanceCandidate,
  AttendanceCode,
  AttendanceRow,
  AttendanceSheet,
  AttendanceSheetQuery,
  CloseAttendanceRequest,
  MarkAttendanceRequest,
} from './attendanceTypes'

/** Buổi sinh hoạt và sự kiện dùng cùng các tài nguyên con `attendance`. */
function base(activity: AttendanceActivityRef): string {
  const club = `/clubs/${encodeURIComponent(activity.clubId)}`
  const id = encodeURIComponent(activity.id)
  return activity.type === 'SESSION' ? `${club}/sessions/${id}/attendance` : `${club}/events/${id}/attendance`
}

export const attendanceRepository = {
  sheet: (activity: AttendanceActivityRef, query: AttendanceSheetQuery) =>
    httpClient.get<AttendanceSheet>(base(activity), { query: { day: query.day, q: query.q, status: query.status, page: query.page, size: query.size } }),
  mark: (activity: AttendanceActivityRef, userId: string, request: MarkAttendanceRequest) =>
    httpClient.put<AttendanceRow>(`${base(activity)}/records/${encodeURIComponent(userId)}`, request),
  candidates: (activity: AttendanceActivityRef, query: { day: string | null; q: string }) =>
    httpClient.get<AttendanceCandidate[]>(`${base(activity)}/candidates`, { query: { day: query.day ?? undefined, q: query.q || undefined } }),
  close: (activity: AttendanceActivityRef, request: CloseAttendanceRequest) => httpClient.post<AttendanceSheet>(`${base(activity)}/transitions`, request),
  code: (activity: AttendanceActivityRef, day: string | null) => httpClient.get<AttendanceCode>(`${base(activity)}/code`, { query: { day: day ?? undefined } }),
}

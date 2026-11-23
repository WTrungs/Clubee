import type { AttendanceActivityRef, AttendanceSheetQuery } from '../model/attendanceTypes'
import type { SessionQuery } from '../model/sessionTypes'

export const attendanceQueryKeys = {
  sessions: ['sessions'] as const,
  sessionLists: ['sessions', 'list'] as const,
  sessionList: (clubId: string, query: SessionQuery) => ['sessions', 'list', clubId, query] as const,
  session: (clubId: string, sessionId: string) => ['sessions', 'detail', clubId, sessionId] as const,
  sessionScopes: (clubId: string) => ['sessions', 'scopes', clubId] as const,
  absenceRequests: (clubId: string, sessionId: string) => ['sessions', 'absences', clubId, sessionId] as const,
  registrationsOf: (clubId: string, sessionId: string) => ['sessions', 'registrations', clubId, sessionId] as const,
  registrations: (clubId: string, sessionId: string, query: { q?: string; page?: number }) => ['sessions', 'registrations', clubId, sessionId, query] as const,
  attendance: ['attendance'] as const,
  /** Mọi danh sách điểm danh của một buổi hoặc một sự kiện (mọi ngày, mọi bộ lọc). */
  sheets: (activity: AttendanceActivityRef) => ['attendance', 'sheet', activity.type, activity.clubId, activity.id] as const,
  sheet: (activity: AttendanceActivityRef, query: AttendanceSheetQuery) => ['attendance', 'sheet', activity.type, activity.clubId, activity.id, query] as const,
  candidatesOf: (activity: AttendanceActivityRef) => ['attendance', 'candidates', activity.type, activity.clubId, activity.id] as const,
  candidates: (activity: AttendanceActivityRef, day: string | null, q: string) => ['attendance', 'candidates', activity.type, activity.clubId, activity.id, day, q] as const,
  /** Không nằm trong `sheets`, để lần làm mới danh sách không kéo theo lần tải mã. */
  code: (activity: AttendanceActivityRef, day: string | null) => ['attendance', 'code', activity.type, activity.clubId, activity.id, day] as const,
}

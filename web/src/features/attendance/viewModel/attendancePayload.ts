import type { AttendanceActivityRef } from '../model/attendanceTypes'

const PREFIX = 'clubee://attendance?'
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type ParsedAttendancePayload = { ok: true; activity: AttendanceActivityRef; code: string; day: string | null } | { ok: false; message: string }

/** Đọc nội dung mã QR điểm danh `clubee://attendance?type&club&id&code[&day]` (FR-ATT-05, FR-ATT-06); máy chủ mới là nơi kiểm mã. */
export function parseAttendancePayload(text: string): ParsedAttendancePayload {
  const invalid = { ok: false as const, message: 'Đây không phải mã điểm danh Clubee.' }
  const trimmed = text.trim()
  if (!trimmed.startsWith(PREFIX)) return invalid
  const params = new URLSearchParams(trimmed.slice(PREFIX.length))
  const type = params.get('type')
  const clubId = params.get('club')
  const id = params.get('id')
  const code = params.get('code')
  const day = params.get('day')
  if ((type !== 'SESSION' && type !== 'EVENT') || !clubId || !id || !code) return invalid
  if (day !== null && !DAY_PATTERN.test(day)) return invalid
  if (type === 'EVENT' && day === null) return invalid
  return { ok: true, activity: { type, clubId, id }, code, day: type === 'SESSION' ? null : day }
}

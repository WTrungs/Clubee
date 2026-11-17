import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { useNow } from '@/shared/hooks/useNow'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef, AttendanceCode } from '../model/attendanceTypes'
import { secondsLeft } from './attendanceDisplay'
import { attendanceQueryKeys } from './attendanceQueryKeys'

const MIN_WAIT_MS = 1000
/** Màn chiếu thường không có người đứng cạnh, nên lỗi mạng, máy chủ thì tự thử lại theo nhịp này. */
const RETRY_MS = 10_000

/** Thiếu quyền, chưa mở, đã chốt: tải lại không đổi được kết quả nên dừng hẳn. */
const isRuleError = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500

/** Lúc mã hết hạn theo đồng hồ máy này; đồng hồ lệch máy chủ tới mức vô lý thì coi mã còn trọn một chu kỳ từ lúc nhận. */
export function localExpiry(code: AttendanceCode, receivedAt: number): number {
  const cycleMs = code.refreshSeconds * 1000
  const remaining = Date.parse(code.expiresAt) - receivedAt
  return receivedAt + (remaining > 0 && remaining <= cycleMs ? remaining : cycleMs)
}

/** Tải mã mới đúng lúc mã hiện tại hết hạn; lỗi do quy tắc thì dừng, lỗi mạng thì thử lại thưa. */
export function codeRefetchInterval(state: { error: unknown; data: AttendanceCode | undefined; dataUpdatedAt: number }, now = Date.now()): number | false {
  if (state.error) return isRuleError(state.error) ? false : RETRY_MS
  if (!state.data) return false
  return Math.max(localExpiry(state.data, state.dataUpdatedAt) - now, MIN_WAIT_MS)
}

/** FR-ATT-05: mã QR của chu kỳ hiện tại. Chỉ gắn khi hộp thoại đang mở, nên chỉ tải khi có người xem. */
export function useAttendanceQrViewModel(activity: AttendanceActivityRef, day: string | null) {
  const queryClient = useQueryClient()
  const now = useNow(1000)
  const codeQuery = useQuery({
    queryKey: attendanceQueryKeys.code(activity, day),
    queryFn: async () => {
      try {
        return await attendanceRepository.code(activity, day)
      } catch (error) {
        // Người khác vừa chốt hoặc mất quyền: làm mới danh sách phía sau để hiện đúng trạng thái.
        if (isRuleError(error)) void queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.sheets(activity) })
        throw error
      }
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => codeRefetchInterval(query.state),
  })

  const error = codeQuery.error
  // Lần tải lại chạy lúc mã cũ hết hạn, nên gặp lỗi thì mã đang giữ không còn dùng được.
  const code = error ? null : (codeQuery.data ?? null)
  // Kẹp theo chu kỳ: nhịp đếm `now` có thể chậm tới 1 giây so với lúc mã mới về.
  const left = code ? Math.min(code.refreshSeconds, secondsLeft(localExpiry(code, codeQuery.dataUpdatedAt), now)) : 0
  return {
    code,
    /** Câu máy chủ trả khi không cấp mã (thiếu quyền, chưa mở, đã chốt); khi đó ẩn mã. */
    blockedReason: isRuleError(error) ? getErrorMessage(error) : null,
    /** Lỗi mạng, máy chủ: tự thử lại sau `RETRY_MS`, người dùng cũng bấm thử lại được. */
    loadError: error && !isRuleError(error) ? error : null,
    retry: () => void codeQuery.refetch(),
    secondsLeft: left,
    /** Phần chu kỳ còn lại, từ 1 về 0, cho thanh tiến độ. */
    remainingRatio: code ? left / code.refreshSeconds : 0,
    /** Mã vừa hết hạn và đang chờ mã mới. */
    renewing: code !== null && left === 0,
  }
}

export type AttendanceQrViewModel = ReturnType<typeof useAttendanceQrViewModel>

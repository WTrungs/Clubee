import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getErrorMessage } from '@/api/apiError'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { attendanceRepository } from '../model/attendanceRepository'
import type { AttendanceActivityRef } from '../model/attendanceTypes'
import { attendanceQueryKeys } from './attendanceQueryKeys'

/** Thành viên CLB chưa có trong danh sách, để thêm làm người phát sinh (FR-ATT-07). */
export function useAttendanceCandidates(activity: AttendanceActivityRef, day: string | null, open: boolean) {
  const [keyword, setKeyword] = useState('')
  const q = useDebouncedValue(keyword.trim(), 300)
  const candidates = useQuery({
    queryKey: attendanceQueryKeys.candidates(activity, day, q),
    queryFn: () => attendanceRepository.candidates(activity, { day, q }),
    enabled: open,
    staleTime: 0,
  })
  return {
    keyword,
    setKeyword,
    candidates: candidates.data ?? [],
    loading: candidates.isPending && open,
    error: candidates.error ? getErrorMessage(candidates.error) : null,
    retry: () => void candidates.refetch(),
  }
}

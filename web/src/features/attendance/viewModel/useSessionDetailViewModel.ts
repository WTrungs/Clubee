import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { sessionRepository } from '../model/sessionRepository'
import { attendanceQueryKeys } from './attendanceQueryKeys'

export type SessionTab = 'info' | 'attendance'

export function useSessionDetailViewModel() {
  const { clubId } = useCurrentClub()
  const sessionId = useParams().sessionId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const session = useQuery({
    queryKey: attendanceQueryKeys.session(clubId, sessionId),
    queryFn: () => sessionRepository.get(clubId, sessionId),
  })
  const canViewAttendance = session.data?.allowedActions.includes('VIEW_ATTENDANCE') ?? false
  const tabs: Array<{ value: SessionTab; label: string }> = [
    { value: 'info', label: 'Thông tin' },
    ...(canViewAttendance ? [{ value: 'attendance' as const, label: 'Điểm danh' }] : []),
  ]
  const requested = searchParams.get('tab')
  const tab: SessionTab = tabs.some((item) => item.value === requested) ? (requested as SessionTab) : 'info'

  return {
    clubId,
    sessionId,
    session: session.data ?? null,
    loading: session.isPending,
    error: session.error,
    refetch: () => void session.refetch(),
    canViewAttendance,
    tabs,
    tab,
    setTab: (value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value === 'info') next.delete('tab')
      else next.set('tab', value)
      setSearchParams(next, { replace: true })
    },
  }
}

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { rememberLastClubId } from '@/features/account/viewModel/lastClub'
import { memberRepository } from '../model/memberRepository'
import { invitationPageState } from './invitationDisplay'
import { memberQueryKeys } from './memberQueryKeys'
import type { JoinTarget } from './useJoinRequestFormViewModel'

/** FR-MEM-01: người mở liên kết mời xem CLB, người mời, hạn rồi gửi yêu cầu gia nhập (vẫn chờ duyệt, FR-MEM-02). */
export function useInvitationPageViewModel() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const preview = useQuery({ queryKey: memberQueryKeys.invitationPreview(token), queryFn: () => memberRepository.invitationPreview(token), staleTime: 0 })
  const [joinTarget, setJoinTarget] = useState<JoinTarget | null>(null)
  const data = preview.data ?? null

  return {
    preview: data,
    state: data ? invitationPageState(data) : null,
    loading: preview.isPending,
    error: preview.error,
    refetch: () => void preview.refetch(),
    joinTarget,
    openJoin: () => {
      if (data) setJoinTarget({ id: data.club.id, name: data.club.name, collectsStudentId: data.club.collectsStudentId, invitationToken: data.token })
    },
    closeJoin: () => setJoinTarget(null),
    enterClub: () => {
      if (!data) return
      rememberLastClubId(data.club.id)
      void navigate(`/clubs/${encodeURIComponent(data.club.id)}`)
    },
  }
}

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { orgRepository } from '../model/orgRepository'
import type { Position } from '../model/orgTypes'
import { orgQueryKeys } from './orgQueryKeys'
import type { AssignPreset } from './useOrgStructureViewModel'

/** Chức vụ đang hoặc sắp có hiệu lực của một thành viên, kèm gán và thu hồi từ hồ sơ thành viên (FR-ORG-02, 03). */
export function useMemberPositionsViewModel(userId: string) {
  const { clubId, club } = useCurrentClub()
  const [assign, setAssign] = useState<AssignPreset | null>(null)
  const [revoking, setRevoking] = useState<Position | null>(null)
  const positions = useQuery({ queryKey: orgQueryKeys.positions(clubId, { userId }), queryFn: () => orgRepository.positions(clubId, { userId }) })

  return {
    clubName: club.name,
    positions: positions.data?.content ?? [],
    loading: positions.isPending,
    error: positions.error,
    refetch: () => void positions.refetch(),
    assign,
    openAssign: (preset: AssignPreset) => setAssign(preset),
    closeAssign: () => setAssign(null),
    revoking,
    openRevoke: (position: Position) => setRevoking(position),
    closeRevoke: () => setRevoking(null),
  }
}

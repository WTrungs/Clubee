import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { rememberLastClubId } from '@/features/account/viewModel/lastClub'
import { canEnterClub } from '@/features/account/viewModel/memberStatus'
import type { JoinTarget } from '@/features/member/viewModel/useJoinRequestFormViewModel'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { clubRepository } from '../model/clubRepository'
import type { ClubDirectoryEntry, ClubDirectoryQuery } from '../model/clubTypes'
import { clubQueryKeys } from './useClubDetail'

const PAGE_SIZE = 12

export type DirectoryState = 'member' | 'pending' | 'rejected' | 'former' | 'none'

/** Trạng thái hiển thị trên thẻ CLB, suy từ tư cách gần nhất máy chủ trả về. */
export function directoryState(entry: ClubDirectoryEntry): DirectoryState {
  const membership = entry.myMembership
  if (!membership) return 'none'
  if (membership.status === 'PENDING') return 'pending'
  if (canEnterClub(membership.status)) return 'member'
  return membership.exitKind === 'REJECTED' ? 'rejected' : 'former'
}

/** Tìm CLB và gửi yêu cầu gia nhập (FR-MEM-02, một phần FR-CLB-05). */
export function useClubDirectoryViewModel() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const [joinTarget, setJoinTarget] = useState<JoinTarget | null>(null)

  const query: ClubDirectoryQuery = { q: debouncedKeyword || undefined, page, size: PAGE_SIZE }
  const clubs = useQuery({ queryKey: clubQueryKeys.directory(query), queryFn: () => clubRepository.directory(query), placeholderData: keepPreviousData })

  return {
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    clubs: clubs.data?.content ?? [],
    loading: clubs.isPending,
    error: clubs.error,
    refetch: () => void clubs.refetch(),
    page: clubs.data?.page ?? 0,
    totalPages: clubs.data?.totalPages ?? 0,
    totalElements: clubs.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    joinTarget,
    openJoin: (entry: ClubDirectoryEntry) => setJoinTarget({ id: entry.id, name: entry.name, collectsStudentId: entry.collectsStudentId }),
    closeJoin: () => setJoinTarget(null),
    enterClub: (clubId: string) => {
      rememberLastClubId(clubId)
      void navigate(`/clubs/${clubId}`)
    },
  }
}

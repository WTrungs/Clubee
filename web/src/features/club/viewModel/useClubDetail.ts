import { useQuery } from '@tanstack/react-query'
import { clubRepository } from '../model/clubRepository'
import type { ClubDirectoryQuery } from '../model/clubTypes'

export const clubQueryKeys = {
  all: ['clubs'] as const,
  detail: (clubId: string) => ['clubs', clubId] as const,
  settings: (clubId: string) => ['clubs', clubId, 'settings'] as const,
  directories: ['clubDirectory'] as const,
  directory: (query: ClubDirectoryQuery) => ['clubDirectory', query] as const,
}

export function useClubDetail(clubId: string) {
  return useQuery({
    queryKey: clubQueryKeys.detail(clubId),
    queryFn: () => clubRepository.getClub(clubId),
  })
}

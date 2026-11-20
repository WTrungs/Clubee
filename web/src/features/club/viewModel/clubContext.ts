import { createContext, useContext } from 'react'
import type { ClubDetail } from '../model/clubTypes'

/** CLB hiện hành lấy từ route; mọi thao tác ghi gắn vào CLB này (FR-ACC-06). */
export interface ClubContextValue {
  clubId: string
  club: ClubDetail
}

export const ClubContext = createContext<ClubContextValue | null>(null)

export function useCurrentClub(): ClubContextValue {
  const value = useContext(ClubContext)
  if (!value) throw new Error('useCurrentClub must be used inside ClubLayout')
  return value
}

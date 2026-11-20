import { useNavigate } from 'react-router'
import type { ClubMembershipSummary } from '../model/accountTypes'
import { readLastClubId, rememberLastClubId } from './lastClub'
import { canEnterClub } from './memberStatus'
import { useCurrentUser } from './useSession'

/** CLB hiện hành: CLB trong route; ở trang cá nhân là CLB gần nhất, rồi CLB đầu tiên (FR-ACC-06, IF-01). */
export function pickCurrentClub(memberships: ClubMembershipSummary[], routeClubId: string | undefined, lastClubId: string | null) {
  const enterable = memberships.filter((membership) => canEnterClub(membership.memberStatus))
  if (routeClubId) return enterable.find((membership) => membership.clubId === routeClubId) ?? null
  return enterable.find((membership) => membership.clubId === lastClubId) ?? enterable[0] ?? null
}

export function useClubSwitcherViewModel(routeClubId: string | undefined) {
  const user = useCurrentUser()
  const navigate = useNavigate()

  return {
    current: pickCurrentClub(user.memberships, routeClubId, readLastClubId()),
    inClubRoute: Boolean(routeClubId),
    memberships: user.memberships.filter((membership) => canEnterClub(membership.memberStatus)),
    select: (clubId: string) => {
      rememberLastClubId(clubId)
      void navigate(`/clubs/${clubId}`)
    },
  }
}

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { matchesKeyword } from '@/shared/lib/searchText'
import { rememberLastClubId } from './lastClub'
import { canEnterClub } from './memberStatus'
import { useCurrentUser } from './useSession'

export function useMyClubsViewModel() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const memberships = useMemo(
    () => user.memberships.filter((membership) => matchesKeyword(`${membership.clubName} ${membership.shortName} ${membership.field}`, keyword)),
    [user.memberships, keyword],
  )
  const staffEvents = useMemo(
    () => user.staffEvents.filter((event) => matchesKeyword(`${event.eventName} ${event.clubName}`, keyword)),
    [user.staffEvents, keyword],
  )

  return {
    firstName: user.fullName.trim().split(/\s+/).at(-1) ?? user.fullName,
    keyword,
    setKeyword,
    memberships,
    staffEvents,
    hasAnyClub: user.memberships.length > 0 || user.staffEvents.length > 0,
    canEnter: canEnterClub,
    /** FR-CLB-01: ai có tài khoản cũng tạo được CLB. */
    createOpen,
    openCreate: () => setCreateOpen(true),
    closeCreate: () => setCreateOpen(false),
    openClub: (clubId: string) => {
      rememberLastClubId(clubId)
      void navigate(`/clubs/${clubId}`)
    },
  }
}

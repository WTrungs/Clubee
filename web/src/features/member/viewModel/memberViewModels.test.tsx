import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { clubRepository } from '@/features/club/model/clubRepository'
import type { ClubDirectoryEntry } from '@/features/club/model/clubTypes'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { directoryState } from '@/features/club/viewModel/useClubDirectoryViewModel'
import { createTestWrapper, signInAs } from '@/testUtils'
import { useMemberDetailViewModel } from './useMemberDetailViewModel'

async function clubWrapper(clubId: string) {
  const club = await clubRepository.getClub(clubId)
  const { wrapper: Base } = createTestWrapper()
  return ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId, club }}>{children}</ClubContext.Provider>
    </Base>
  )
}

const entry = (myMembership: ClubDirectoryEntry['myMembership']): ClubDirectoryEntry => ({
  id: 'c-x',
  name: 'CLB X',
  shortName: 'X',
  field: 'Thử',
  description: '',
  logoUrl: null,
  contactEmail: null,
  contactPhone: null,
  contactUrl: null,
  collectsStudentId: false,
  myMembership,
  allowedActions: [],
})

describe('directoryState', () => {
  it('maps the latest membership to what the directory card shows', () => {
    expect(directoryState(entry(null))).toBe('none')
    expect(directoryState(entry({ status: 'PENDING', exitKind: null, rejectionReason: null }))).toBe('pending')
    expect(directoryState(entry({ status: 'ON_LEAVE', exitKind: null, rejectionReason: null }))).toBe('member')
    expect(directoryState(entry({ status: 'LEFT', exitKind: 'REJECTED', rejectionReason: 'Đủ người.' }))).toBe('rejected')
    expect(directoryState(entry({ status: 'LEFT', exitKind: 'RESIGNED', rejectionReason: null }))).toBe('former')
  })
})

describe('useMemberDetailViewModel', () => {
  it('shows the conflict banner on 409 without overwriting, and drops it for another member (NFR-REL-03)', async () => {
    signInAs('u-anh')
    const wrapper = await clubWrapper('c-guitar')
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useMemberDetailViewModel(id), { wrapper, initialProps: { id: 'm-guitar-tram' } })
    await waitFor(() => expect(result.current.member?.membershipId).toBe('m-guitar-tram'))
    expect(result.current.actions).toEqual(['CONFIRM', 'REMOVE'])

    const tram = db.memberships.find((membership) => membership.id === 'm-guitar-tram')
    if (tram) tram.version += 1
    act(() => result.current.requestAction('CONFIRM'))
    expect(result.current.dialog).toBe('CONFIRM')
    act(() => result.current.confirm('Hoàn thành thử việc.'))
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(result.current.dialog).toBeNull()
    expect(tram?.status).toBe('PROBATION')

    rerender({ id: 'm-guitar-thao' })
    expect(result.current.conflict).toBe(false)
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/apiError'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { TransferMembersSheet } from './TransferMembersSheet'

const source = { id: 'd-external', name: 'Đối ngoại', memberCount: 2 }

async function renderSheet(props: { membersError: unknown; onRetryMembers: () => void }) {
  signInAs('u-anh')
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base } = createTestWrapper()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  return render(<TransferMembersSheet source={source} members={[]} membersLoading={false} onClose={() => {}} {...props} />, { wrapper })
}

describe('TransferMembersSheet (FR-MEM-10)', () => {
  it('shows the load error with a retry instead of an empty department, and keeps submit locked', async () => {
    const onRetryMembers = vi.fn()
    await renderSheet({ membersError: new ApiError(503, { detail: 'Máy chủ đang bận.' }), onRetryMembers })
    expect(await screen.findByText('Máy chủ đang bận.')).toBeInTheDocument()
    expect(screen.queryByText('Ban không còn thành viên.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetryMembers).toHaveBeenCalledOnce()
  })
})

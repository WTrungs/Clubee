import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { problem } from '@/api/mocks/mockHttp'
import { nowIso, vnDate } from '@/api/mocks/mockTime'
import { server } from '@/api/mocks/server'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { SessionListPage } from './SessionListPage'

async function renderPage(userId: string) {
  signInAs(userId)
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Wrapper } = createTestWrapper('/clubs/c-guitar/sessions')
  render(
    <Wrapper>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>
        <SessionListPage />
      </ClubContext.Provider>
    </Wrapper>,
  )
}

describe('SessionListPage', () => {
  it('keeps the form open with the server reason when the head loses the position meanwhile (IF-01)', async () => {
    await renderPage('u-linh')
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo buổi' }))
    const sheet = await screen.findByRole('dialog', { name: 'Tạo buổi sinh hoạt' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Tên buổi' }), 'Họp ban cuối tháng')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Địa điểm' }), 'Phòng A2')

    const position = db.positions.find((candidate) => candidate.userId === 'u-linh' && candidate.role === 'DEPARTMENT_HEAD' && candidate.scopeId === 'd-media')
    if (position) Object.assign(position, { endOn: vnDate(-1), revokedAt: nowIso(), revokeReason: 'Thử nghiệm' })
    const submit = within(sheet).getByRole('button', { name: 'Tạo buổi' })
    await userEvent.click(submit)

    expect(await within(sheet).findByText('Bạn chỉ tạo được buổi sinh hoạt cho ban đang hoạt động mà mình là Trưởng ban hoặc Phó ban.')).toBeInTheDocument()
    await waitFor(() => expect(submit).toBeDisabled())
    expect(screen.getByRole('dialog', { name: 'Tạo buổi sinh hoạt' })).toBeInTheDocument()
    expect(db.sessions.some((session) => session.title === 'Họp ban cuối tháng')).toBe(false)
  })

  it('says when the create scopes or the department filter cannot load', async () => {
    server.use(
      http.get('*/api/v1/clubs/:clubId/session-scopes', () => problem(500, 'Máy chủ đang bận.', 'INTERNAL')),
      http.get('*/api/v1/clubs/:clubId/departments', () => problem(500, 'Máy chủ đang bận.', 'INTERNAL')),
    )
    await renderPage('u-anh')
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(screen.getByText(/Không tải được quyền tạo buổi: Máy chủ đang bận\./)).toBeVisible()
    expect(screen.getByText(/Không tải được danh sách ban để lọc: Máy chủ đang bận\./)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Tạo buổi' })).toBeNull()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { useState, type ReactNode } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { createTestWrapper, signInAs } from '@/testUtils'
import { clubRepository } from '../model/clubRepository'
import { ClubContext } from '../viewModel/clubContext'
import { clubQueryKeys } from '../viewModel/useClubDetail'
import { ClubSettingsSheet } from './ClubSettingsSheet'

function Host() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Mở tham số
      </button>
      <ClubSettingsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('ClubSettingsSheet (FR-CLB-03, NFR-REL-01)', () => {
  // Công tắc Radix đo kích thước bằng ResizeObserver, jsdom không có.
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })
  afterAll(() => vi.unstubAllGlobals())

  it('shows the summer mark only when split, checks semester order, then saves the new groups', async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    const user = userEvent.setup()
    render(<Host />, { wrapper })
    await user.click(screen.getByRole('button', { name: 'Mở tham số' }))

    const cancelHours = await screen.findByRole('textbox', { name: 'Hạn hủy đăng ký' })
    await user.clear(cancelHours)
    await user.type(cancelHours, '12')
    expect(screen.queryByRole('textbox', { name: 'Kỳ hè bắt đầu' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: /Tách kỳ hè/ }))
    const summer = screen.getByRole('textbox', { name: 'Kỳ hè bắt đầu' })
    expect(summer).toHaveValue('01/07')
    await user.clear(summer)
    await user.type(summer, '01/12')
    await user.click(screen.getByRole('button', { name: 'Lưu tham số' }))
    expect(await screen.findByText('Kỳ hè phải bắt đầu sau học kỳ 2 và trước học kỳ 1 năm sau.')).toBeInTheDocument()
    expect(summer).toHaveAttribute('aria-invalid', 'true')

    await user.clear(summer)
    await user.type(summer, '15/06')
    await user.click(screen.getByRole('button', { name: 'Lưu tham số' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tham số CLB' })).not.toBeInTheDocument())
    expect(await clubRepository.settings('c-guitar')).toMatchObject({ registrationCancelHours: 12, summerStart: '06-15', version: 2 })
  })

  it('can still be closed when reopened after a save and the settings fail to load', async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base, queryClient } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    const user = userEvent.setup()
    render(<Host />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Mở tham số' }))
    const days = await screen.findByRole('textbox', { name: 'Hạn liên kết mời' })
    await user.clear(days)
    await user.type(days, '10')
    await user.click(screen.getByRole('button', { name: 'Lưu tham số' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tham số CLB' })).not.toBeInTheDocument())

    // Cache đã bị dọn và lần tải lại lỗi: sheet chỉ có ErrorState, không có form.
    queryClient.removeQueries({ queryKey: clubQueryKeys.settings('c-guitar') })
    server.use(http.get('*/clubs/:clubId/settings', () => problem(503, 'Máy chủ đang bận.', 'UNAVAILABLE')))
    await user.click(screen.getByRole('button', { name: 'Mở tham số' }))
    expect(await screen.findByText('Máy chủ đang bận.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tham số CLB' })).not.toBeInTheDocument())
  })
})

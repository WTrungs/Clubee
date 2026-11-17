import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { vnDate } from '@/api/mocks/mockTime'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { termRepository } from '../model/termRepository'
import { AppointmentsSheet } from './AppointmentsSheet'

describe('AppointmentsSheet (FR-TERM-03)', () => {
  it('shows the saved people once the member list arrives, so what is on screen is what gets saved', async () => {
    signInAs('u-anh')
    const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    const started = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
    const handover = await termRepository.saveAppointments('c-guitar', started.id, {
      appointments: [
        { role: 'PRESIDENT', departmentId: null, userId: 'u-linh' },
        { role: 'DEPARTMENT_HEAD', departmentId: 'd-media', userId: 'u-vy' },
      ],
      version: started.version,
    })
    const club = await clubRepository.getClub('c-guitar')
    // QueryClient mới: danh sách thành viên chưa có trong cache, giống lần mở đầu sau khi tải lại trang.
    const { wrapper: Wrapper } = createTestWrapper()
    render(
      <Wrapper>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>
          <AppointmentsSheet handover={handover} open onClose={() => {}} />
        </ClubContext.Provider>
      </Wrapper>,
    )

    const sheet = await screen.findByRole('dialog', { name: 'Kết quả bầu' })
    const rows = await within(sheet).findAllByRole('listitem')
    const president = within(rows[0] as HTMLElement).getByRole('combobox', { name: 'Người được bầu' })
    const head = within(rows[1] as HTMLElement).getByRole('combobox', { name: 'Người được bầu' })
    // Chờ danh sách thành viên về hẳn rồi mới kiểm, để lỗi không bị che bởi lúc đang tải.
    await within(president).findByRole('option', { name: 'Đặng Khánh Linh · Ban Truyền thông' })
    await within(head).findByRole('option', { name: 'Hoàng Thảo Vy · Ban Truyền thông' })
    expect(president).toHaveDisplayValue('Đặng Khánh Linh · Ban Truyền thông')
    expect(head).toHaveDisplayValue('Hoàng Thảo Vy · Ban Truyền thông')
  })
})

describe('AppointmentsSheet with a person who no longer qualifies', () => {
  it('keeps the saved name on the right row and marks it, instead of an empty choice', async () => {
    signInAs('u-anh')
    const next = await termRepository.create('c-guitar', { name: 'Nhiệm kỳ 2027–2028', startOn: vnDate(301), endOn: vnDate(665) })
    const started = await termRepository.startHandover('c-guitar', { fromTermId: 't-guitar-2026', toTermId: next.id })
    const handover = await termRepository.saveAppointments('c-guitar', started.id, {
      appointments: [
        { role: 'PRESIDENT', departmentId: null, userId: 'u-linh' },
        { role: 'DEPARTMENT_HEAD', departmentId: 'd-media', userId: 'u-linh' },
      ],
      version: started.version,
    })
    // Linh đổi ban chính sau khi được bầu: vẫn làm Chủ nhiệm được, nhưng không còn làm Trưởng ban Truyền thông.
    const linh = db.memberships.find((membership) => membership.userId === 'u-linh' && membership.clubId === 'c-guitar')
    if (linh) linh.departmentId = 'd-logistics'
    const fresh = await termRepository.handover('c-guitar', handover.id)
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Wrapper } = createTestWrapper()
    render(
      <Wrapper>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>
          <AppointmentsSheet handover={fresh} open onClose={() => {}} />
        </ClubContext.Provider>
      </Wrapper>,
    )

    const sheet = await screen.findByRole('dialog', { name: 'Kết quả bầu' })
    const rows = await within(sheet).findAllByRole('listitem')
    expect(within(rows[0] as HTMLElement).getByRole('combobox', { name: 'Người được bầu' })).toHaveDisplayValue('Đặng Khánh Linh · Ban Hậu cần')
    expect(within(rows[1] as HTMLElement).getByRole('combobox', { name: 'Người được bầu' })).toHaveDisplayValue('Đặng Khánh Linh (không còn đủ điều kiện, chọn người khác)')
  })
})

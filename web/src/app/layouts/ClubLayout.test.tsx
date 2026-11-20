import { render, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { readLastClubId } from '@/features/account/viewModel/lastClub'
import { eventRepository } from '@/features/event/model/eventRepository'
import { createTestWrapper, signInAs } from '@/testUtils'
import { ClubLayout } from './ClubLayout'

function renderClub(path: string) {
  const { wrapper: Wrapper } = createTestWrapper(path)
  render(
    <Wrapper>
      <Routes>
        <Route path="/clubs/:clubId" element={<ClubLayout />}>
          <Route index element={<p>Trang tổng quan</p>} />
          <Route path="members" element={<p>Trang thành viên</p>} />
          <Route path="events" element={<p>Trang sự kiện</p>} />
          <Route path="events/:eventId" element={<p>Trang chi tiết sự kiện</p>} />
        </Route>
      </Routes>
    </Wrapper>,
  )
}

async function addTamAsCollaborator() {
  signInAs('u-bao')
  await eventRepository.addCollaborator('c-guitar', 'e-winter', 'sc-winter-media', 'tam.duong@demo.test')
  signInAs('u-tam')
}

describe('ClubLayout for an event guest (FR-EVT-07, SRS 3.5)', () => {
  it('sends a guest from the club overview to the events page and does not remember the club', async () => {
    await addTamAsCollaborator()
    renderClub('/clubs/c-guitar')
    expect(await screen.findByText('Trang sự kiện')).toBeInTheDocument()
    expect(readLastClubId()).not.toBe('c-guitar')
  })

  it('opens the event page but explains why other club pages are closed', async () => {
    await addTamAsCollaborator()
    renderClub('/clubs/c-guitar/members')
    expect(await screen.findByText('Bạn là khách ban tổ chức của CLB Guitar Sinh viên')).toBeInTheDocument()
    expect(screen.queryByText('Trang thành viên')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem sự kiện' })).toHaveAttribute('href', '/clubs/c-guitar/events')
  })

  it('opens the event detail for a guest', async () => {
    await addTamAsCollaborator()
    renderClub('/clubs/c-guitar/events/e-winter')
    expect(await screen.findByText('Trang chi tiết sự kiện')).toBeInTheDocument()
  })

  it('leaves members untouched', async () => {
    signInAs('u-ha')
    renderClub('/clubs/c-guitar/members')
    expect(await screen.findByText('Trang thành viên')).toBeInTheDocument()
  })
})

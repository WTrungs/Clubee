import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { problem } from '@/api/mocks/mockHttp'
import { grantPosition } from '@/api/mocks/mockPermissions'
import { server } from '@/api/mocks/server'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { eventRepository } from '@/features/event/model/eventRepository'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { createTestWrapper, signInAs } from '@/testUtils'
import { notificationRepository } from '../model/notificationRepository'
import type { AnnouncementAudienceRef, SendAnnouncementRequest } from '../model/notificationTypes'
import { useComposeAnnouncementViewModel } from './useComposeAnnouncementViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const send = (audience: AnnouncementAudienceRef, overrides: Partial<SendAnnouncementRequest> = {}) =>
  notificationRepository.sendAnnouncement('c-guitar', { audience, title: 'Họp ban tuần này', body: 'Tối thứ Năm 19:00 ở phòng B2.05.', sendEmail: false, ...overrides })

describe('announcement audiences (FR-NOT-01)', () => {
  it('gives the board the whole club, every open department and the staff of running events', async () => {
    signInAs('u-anh')
    const audiences = await notificationRepository.audiences('c-guitar')
    expect(audiences[0]).toMatchObject({ kind: 'CLUB', scopeId: 'c-guitar', label: 'Toàn CLB' })
    const scopeIds = audiences.map((audience) => audience.scopeId)
    expect(scopeIds).toEqual(expect.arrayContaining(['d-media', 'd-logistics', 'e-winter']))
    // Ban đã đóng và sự kiện đã hủy không còn ai để nhận.
    expect(scopeIds).not.toContain('d-photo')
    expect(scopeIds).not.toContain('e-acoustic-sep')
    expect((await clubRepository.getClub('c-guitar')).allowedActions).toContain('SEND_ANNOUNCEMENT')
  })

  it('limits a department head to their department and an event lead to their event staff', async () => {
    signInAs('u-linh')
    expect(await notificationRepository.audiences('c-guitar')).toEqual([{ kind: 'DEPARTMENT', scopeId: 'd-media', label: 'Ban Truyền thông', recipientCount: 3 }])
    signInAs('u-bao')
    const lead = await notificationRepository.audiences('c-guitar')
    expect(lead.map((audience) => audience.scopeId)).toEqual(['e-winter'])
    expect(lead[0]?.recipientCount).toBeGreaterThan(0)
  })

  it('gives a department vice head the same scope as the head (SRS 3.2)', async () => {
    grantPosition({ userId: 'u-vy', clubId: 'c-guitar', role: 'DEPARTMENT_VICE_HEAD', scopeId: 'd-media', assignedBy: 'u-anh' })
    signInAs('u-vy')
    expect((await notificationRepository.audiences('c-guitar')).map((audience) => audience.scopeId)).toEqual(['d-media'])
    expect((await send({ kind: 'DEPARTMENT', scopeId: 'd-media' })).recipientCount).toBe(3)
  })

  it('offers nothing to a member without a position', async () => {
    signInAs('u-ha')
    expect(await notificationRepository.audiences('c-guitar')).toEqual([])
    expect((await clubRepository.getClub('c-guitar')).allowedActions).not.toContain('SEND_ANNOUNCEMENT')
  })
})

describe('send announcement (FR-NOT-01, NFR-SEC-03)', () => {
  it('refuses a group outside the sender’s position, with the reason, and creates nothing', async () => {
    signInAs('u-linh')
    const before = db.notifications.length
    const error = await fail(send({ kind: 'DEPARTMENT', scopeId: 'd-logistics' }))
    expect(error?.status).toBe(403)
    expect(error?.detail).toContain('phạm vi chức vụ')
    signInAs('u-ha')
    expect((await fail(send({ kind: 'CLUB', scopeId: 'c-guitar' })))?.status).toBe(403)
    expect(db.notifications).toHaveLength(before)
  })

  it('delivers to the department but not the sender, and members open it with the body', async () => {
    signInAs('u-linh')
    const result = await send({ kind: 'DEPARTMENT', scopeId: 'd-media' }, { sendEmail: true })
    const recipients = db.notificationRecipients.filter((recipient) => recipient.notificationId === result.id).map((recipient) => recipient.userId)
    expect(recipients.toSorted()).toEqual(['u-ha', 'u-vy', 'u-yen'])
    expect(result.recipientCount).toBe(3)
    expect(db.notifications.find((notification) => notification.id === result.id)).toMatchObject({ kind: 'MANUAL', category: 'ANNOUNCEMENT', senderId: 'u-linh', sendEmail: true })

    signInAs('u-ha')
    expect(await notificationRepository.get(result.id)).toMatchObject({ title: 'Họp ban tuần này', body: 'Tối thứ Năm 19:00 ở phòng B2.05.', sender: { id: 'u-linh' } })
  })

  it('reaches the event lead, subcommittee leads and current staff, but not staff who left or the sender', async () => {
    const tram = db.eventStaff.find((staff) => staff.userId === 'u-tram' && staff.eventId === 'e-winter')
    if (tram) tram.leftAt = new Date().toISOString()
    signInAs('u-bao')
    const result = await send({ kind: 'EVENT_STAFF', scopeId: 'e-winter' })
    const recipients = db.notificationRecipients.filter((recipient) => recipient.notificationId === result.id).map((recipient) => recipient.userId)
    expect(recipients.toSorted()).toEqual(['u-ha', 'u-khoa', 'u-kiet', 'u-linh', 'u-long', 'u-nam', 'u-vy'])
    expect(db.notifications.find((notification) => notification.id === result.id)?.target).toEqual({ type: 'EVENT', clubId: 'c-guitar', id: 'e-winter' })
  })

  it('checks the title and body length field by field', async () => {
    signInAs('u-anh')
    const error = await fail(send({ kind: 'CLUB', scopeId: 'c-guitar' }, { title: 'x'.repeat(151), body: '  ' }))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field).sort()).toEqual(['body', 'title'])
  })

  it('refuses a group with nobody but the sender', async () => {
    signInAs('u-ha')
    const club = await clubRepository.create({ name: 'CLB Một Người', shortName: 'CMN', field: 'Thử nghiệm', description: 'CLB mới chỉ có người sáng lập.' })
    const error = await fail(
      notificationRepository.sendAnnouncement(club.id, { audience: { kind: 'CLUB', scopeId: club.id }, title: 'Chào mọi người', body: 'Xin chào.', sendEmail: false }),
    )
    expect(error).toMatchObject({ status: 422, code: 'NO_RECIPIENTS' })
  })
})

describe('opening an announcement checks the audience again (BR-SEC-02)', () => {
  it('lets a collaborator open an event staff announcement until they leave the staff', async () => {
    signInAs('u-bao')
    await eventRepository.addCollaborator('c-guitar', 'e-winter', 'sc-winter-media', 'tam.duong@demo.test')
    const result = await send({ kind: 'EVENT_STAFF', scopeId: 'e-winter' })
    signInAs('u-tam')
    expect(await notificationRepository.get(result.id)).toMatchObject({ body: 'Tối thứ Năm 19:00 ở phòng B2.05.' })

    const row = db.eventStaff.find((staff) => staff.userId === 'u-tam' && staff.eventId === 'e-winter')
    if (row) row.leftAt = new Date().toISOString()
    expect(await fail(notificationRepository.get(result.id))).toMatchObject({ status: 403, code: 'NOT_IN_AUDIENCE' })
  })

  it('refuses a member who left the event staff or moved to another department', async () => {
    signInAs('u-bao')
    const staffNotice = await send({ kind: 'EVENT_STAFF', scopeId: 'e-winter' })
    signInAs('u-linh')
    const departmentNotice = await send({ kind: 'DEPARTMENT', scopeId: 'd-media' })

    const vy = db.eventStaff.find((staff) => staff.userId === 'u-vy' && staff.eventId === 'e-winter')
    if (vy) vy.leftAt = new Date().toISOString()
    signInAs('u-vy')
    expect(await fail(notificationRepository.get(staffNotice.id))).toMatchObject({ status: 403, code: 'NOT_IN_AUDIENCE' })
    expect(await notificationRepository.get(departmentNotice.id)).toMatchObject({ title: 'Họp ban tuần này' })

    const ha = db.memberships.find((membership) => membership.userId === 'u-ha' && membership.clubId === 'c-guitar')
    if (ha) ha.departmentId = 'd-music'
    signInAs('u-ha')
    const refused = await fail(notificationRepository.get(departmentNotice.id))
    expect(refused).toMatchObject({ status: 403, code: 'NOT_IN_AUDIENCE' })
    expect(refused?.detail).toContain('không còn thuộc ban')
  })

  it('keeps the old rule for announcements saved without an audience', async () => {
    signInAs('u-ha')
    expect((await notificationRepository.get('n-guitar-schedule')).title).toBe('Lịch sinh hoạt tháng 11')
    const ha = db.memberships.find((membership) => membership.userId === 'u-ha' && membership.clubId === 'c-guitar')
    if (ha) ha.status = 'LEFT'
    expect(await fail(notificationRepository.get('n-guitar-schedule'))).toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })
})

describe('useComposeAnnouncementViewModel (FR-NOT-01)', () => {
  const render = async (userId: string) => {
    signInAs(userId)
    const club = await clubRepository.getClub('c-guitar')
    const { wrapper: Base, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    const onDone = vi.fn()
    const hook = renderHook(() => useComposeAnnouncementViewModel(onDone), { wrapper })
    await waitFor(() => expect(hook.result.current.audiencesLoading).toBe(false))
    act(() => {
      hook.result.current.form.setValue('title', 'Họp ban tuần này')
      hook.result.current.form.setValue('body', 'Tối thứ Năm 19:00.')
    })
    return { ...hook, onDone, invalidate }
  }

  it('says there is nothing to send when no group is in the sender’s scope', async () => {
    const { result } = await render('u-ha')
    expect(result.current.audiences).toEqual([])
    expect(result.current.nothingToSend).toBe(true)
    expect(result.current.canSubmit).toBe(false)
  })

  it('clears a chosen group that is no longer offered after a reload', async () => {
    const { result } = await render('u-anh')
    act(() => result.current.form.setValue('audience', 'DEPARTMENT:d-logistics'))
    // Anh mất chức Chủ nhiệm trong lúc đang soạn nên không còn gửi được cho ban Hậu cần.
    const president = db.positions.find((position) => position.role === 'PRESIDENT' && position.userId === 'u-anh')
    if (president) Object.assign(president, { endOn: '2000-01-01' })
    await act(() => result.current.retryAudiences())
    await waitFor(() => expect(result.current.audiences.map((audience) => audience.scopeId)).not.toContain('d-logistics'))
    await waitFor(() => expect(result.current.form.getValues('audience')).toBe(''))
  })

  it('preselects the only group, then sends once the server confirms', async () => {
    const { result, onDone } = await render('u-linh')
    await waitFor(() => expect(result.current.form.getValues('audience')).toBe('DEPARTMENT:d-media'))
    expect(result.current.selected?.recipientCount).toBe(3)
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(db.notifications.at(-1)).toMatchObject({ title: 'Họp ban tuần này', senderId: 'u-linh' })
  })

  it('makes the board choose a group, shows the server’s reason when refused and reloads the club’s actions', async () => {
    const { result, onDone, invalidate } = await render('u-anh')
    expect(result.current.audiences.length).toBeGreaterThan(1)
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.form.getFieldState('audience').error?.message).toBe('Chọn nhóm nhận thông báo.'))

    server.use(http.post('*/api/v1/clubs/:clubId/announcements', () => problem(403, 'Bạn không còn giữ chức vụ ở CLB này.', 'FORBIDDEN')))
    act(() => result.current.form.setValue('audience', 'CLUB:c-guitar'))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.errorMessage).toBe('Bạn không còn giữ chức vụ ở CLB này.'))
    expect(onDone).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: clubQueryKeys.detail('c-guitar') })
  })
})

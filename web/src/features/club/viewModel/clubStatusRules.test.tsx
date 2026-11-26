import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { sessionRepository } from '@/features/attendance/model/sessionRepository'
import { clubRepository } from '../model/clubRepository'
import type { ClubDetail } from '../model/clubTypes'
import { ClubContext } from './clubContext'
import { confirmsShortName } from './clubStatusDisplay'
import { useClubStatusViewModel } from './useClubStatusViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const event = { name: 'Sự kiện thử', startAt: '2027-03-01T08:00:00+07:00', endAt: '2027-03-01T11:00:00+07:00', format: 'OFFLINE', location: 'Hội trường A', leadUserId: 'u-anh' }

describe('đổi trạng thái CLB (FR-CLB-04, ST-CLB)', () => {
  it('tạm ngừng chặn tạo sự kiện, buổi, đợt tuyển; hoạt động lại thì mở lại', async () => {
    signInAs('u-anh')
    const before = await clubRepository.getClub('c-guitar')
    expect(before.allowedActions).toEqual(expect.arrayContaining(['CHANGE_CLUB_STATUS', 'CREATE_EVENT', 'CREATE_RECRUITMENT']))
    const suspended = await clubRepository.transition('c-guitar', { action: 'SUSPEND', reason: 'Nghỉ hè hai tháng', version: before.version })
    expect(suspended).toMatchObject({ status: 'SUSPENDED', lastStatusChange: { status: 'SUSPENDED', reason: 'Nghỉ hè hai tháng' } })
    expect(suspended.allowedActions).not.toContain('CREATE_EVENT')
    expect(suspended.allowedActions).not.toContain('PROPOSE_EVENT')
    expect(suspended.allowedActions).not.toContain('CREATE_RECRUITMENT')
    expect(await fail(httpClient.post('/clubs/c-guitar/events', event))).toMatchObject({ status: 422, code: 'CLUB_SUSPENDED' })
    expect(await fail(httpClient.post('/clubs/c-guitar/recruitments', {}))).toMatchObject({ status: 422, code: 'CLUB_SUSPENDED' })
    expect(await sessionRepository.scopes('c-guitar')).toEqual([])
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'CHANGE_CLUB_STATUS', before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' } })
    expect(db.notifications.at(-1)?.title).toBe('CLB Guitar Sinh viên tạm ngừng hoạt động')

    const active = await clubRepository.transition('c-guitar', { action: 'REACTIVATE', reason: 'Vào năm học mới', version: suspended.version })
    expect(active.status).toBe('ACTIVE')
    expect(active.allowedActions).toContain('CREATE_EVENT')
  })

  it('thứ tự lỗi: 403 người ngoài ban chủ nhiệm, 409 version cũ, 422 sai trạng thái, 400 lý do ngắn', async () => {
    signInAs('u-ha')
    expect(await fail(clubRepository.transition('c-guitar', { action: 'SUSPEND', reason: 'Nghỉ hè', version: 1 }))).toMatchObject({ status: 403 })
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    expect(await fail(clubRepository.transition('c-guitar', { action: 'SUSPEND', reason: 'Nghỉ hè', version: club.version - 1 }))).toMatchObject({ status: 409 })
    expect(await fail(clubRepository.transition('c-guitar', { action: 'REACTIVATE', reason: 'Nghỉ hè', version: club.version }))).toMatchObject({
      status: 422,
      code: 'INVALID_TRANSITION',
    })
    expect(await fail(clubRepository.transition('c-guitar', { action: 'SUSPEND', reason: 'hè', version: club.version }))).toMatchObject({ status: 400 })
  })

  it('không giải thể được khi còn sự kiện chưa đóng; báo tên sự kiện', async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const error = await fail(clubRepository.transition('c-guitar', { action: 'DISSOLVE', reason: 'Không còn thành viên', version: club.version }))
    expect(error).toMatchObject({ status: 422, code: 'CLUB_HAS_OPEN_EVENTS' })
    expect(error?.message).toContain('sự kiện chưa đóng')
    expect((await clubRepository.getClub('c-guitar')).status).toBe('ACTIVE')
  })

  it('giải thể: chỉ đọc, từ chối yêu cầu gia nhập đang chờ, chỉ còn hành động xem', async () => {
    signInAs('u-ha')
    await httpClient.post('/clubs/c-volunteer/join-requests', { introduction: 'Mình muốn tham gia tình nguyện.', studentId: '23520001' })
    signInAs('u-tam')
    const club = await clubRepository.getClub('c-volunteer')
    const dissolved = await clubRepository.transition('c-volunteer', { action: 'DISSOLVE', reason: 'Sáp nhập vào CLB khác', version: club.version })
    expect(dissolved.status).toBe('DISSOLVED')
    expect(dissolved.allowedActions.every((action) => action.startsWith('VIEW_'))).toBe(true)
    expect(db.memberships.find((membership) => membership.userId === 'u-ha' && membership.clubId === 'c-volunteer')).toMatchObject({ status: 'LEFT', exitKind: 'REJECTED' })

    expect(await fail(clubRepository.update('c-volunteer', { ...dissolved, version: dissolved.version }))).toMatchObject({ status: 422, code: 'CLUB_DISSOLVED' })
    expect(await fail(clubRepository.transition('c-volunteer', { action: 'REACTIVATE', reason: 'Thử lại', version: dissolved.version }))).toMatchObject({ code: 'CLUB_DISSOLVED' })
    const members = await httpClient.get<{ content: Array<{ membershipId: string }> }>('/clubs/c-volunteer/members')
    const detail = await httpClient.get<{ allowedActions: string[] }>(`/clubs/c-volunteer/members/${members.content[0]?.membershipId ?? ''}`)
    expect(detail.allowedActions.every((action) => action.startsWith('VIEW_'))).toBe(true)

    signInAs('u-ha')
    expect(await fail(httpClient.post('/clubs/c-volunteer/join-requests', { introduction: 'Xin vào lại lần nữa nhé.', studentId: '23520001' }))).toMatchObject({ status: 422, code: 'CLUB_DISSOLVED' })
    expect(await fail(httpClient.patch('/clubs/c-volunteer', {}))).toMatchObject({ status: 403 })
  })
})

describe('useClubStatusViewModel', () => {
  const host = (club: ClubDetail) => {
    const { wrapper: Base } = createTestWrapper()
    return ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: club.id, club }}>{children}</ClubContext.Provider>
      </Base>
    )
  }

  it('giải thể phải gõ đúng tên viết tắt; không hợp lệ thì không gửi', async () => {
    signInAs('u-tam')
    const club = await clubRepository.getClub('c-volunteer')
    let done = false
    const { result } = renderHook(() => useClubStatusViewModel(true, () => (done = true)), { wrapper: host(club) })
    expect(result.current.actions).toEqual(['SUSPEND', 'DISSOLVE'])
    act(() => result.current.selectAction('DISSOLVE'))
    act(() => result.current.setReason('Sáp nhập vào CLB khác'))
    act(() => result.current.setConfirmText('sai'))
    act(() => result.current.submit())
    expect(result.current.shortNameError).toContain(club.shortName)
    expect(result.current.pending).toBe(false)
    act(() => result.current.setConfirmText(club.shortName.toLowerCase()))
    act(() => result.current.submit())
    await waitFor(() => expect(done).toBe(true))
    expect(db.clubs.find((candidate) => candidate.id === 'c-volunteer')?.status).toBe('DISSOLVED')
  })

  it('còn sự kiện chưa đóng thì báo lỗi và đưa liên kết tới danh sách sự kiện', async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const { result } = renderHook(() => useClubStatusViewModel(true, () => undefined), { wrapper: host(club) })
    act(() => result.current.selectAction('DISSOLVE'))
    act(() => result.current.setReason('Không còn thành viên'))
    act(() => result.current.setConfirmText(club.shortName))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.errorMessage).toContain('sự kiện chưa đóng'))
    expect(result.current.eventsPath).toBe('/clubs/c-guitar/events')
  })

  it('confirmsShortName không phân biệt hoa thường, bỏ khoảng trắng hai đầu', () => {
    expect(confirmsShortName(' gsv ', 'GSV')).toBe(true)
    expect(confirmsShortName('GS', 'GSV')).toBe(false)
  })
})

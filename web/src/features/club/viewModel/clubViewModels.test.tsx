import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { httpClient } from '@/api/httpClient'
import { db } from '@/api/mocks/db'
import { firstTermEnd } from '@/api/mocks/handlers/clubHandlers'
import { problem } from '@/api/mocks/mockHttp'
import { server } from '@/api/mocks/server'
import { sessionQueryKey } from '@/api/queryClient'
import { accountRepository } from '@/features/account/model/accountRepository'
import { memberRepository } from '@/features/member/model/memberRepository'
import { memberQueryKeys } from '@/features/member/viewModel/memberQueryKeys'
import { createTestWrapper, signInAs } from '@/testUtils'
import { clubRepository } from '../model/clubRepository'
import type { ClubDetail } from '../model/clubTypes'
import { ClubContext } from './clubContext'
import { useClubProfileViewModel } from './useClubProfileViewModel'
import { useCreateClubViewModel } from './useCreateClubViewModel'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)
const newClub = { name: 'CLB Nhiếp ảnh Sinh viên', shortName: 'NASV', field: 'Nghệ thuật', description: 'Chụp ảnh, triển lãm và dạy nhiếp ảnh cơ bản.' }
const guitar = () => db.clubs.find((club) => club.id === 'c-guitar')

describe('create club (FR-CLB-01, BR-TERM-01)', () => {
  it('makes the creator an official member and president of a running first term', async () => {
    signInAs('u-ha')
    const club = await clubRepository.create(newClub)
    expect(club).toMatchObject({ name: 'CLB Nhiếp ảnh Sinh viên', currentTermName: 'Nhiệm kỳ đầu tiên', myPositionTitles: ['Chủ nhiệm'], collectsStudentId: false, memberCount: 1 })
    expect(club.allowedActions).toEqual(expect.arrayContaining(['EDIT_CLUB', 'MANAGE_ORG', 'ASSIGN_PRESIDENCY']))
    expect(db.terms.filter((term) => term.clubId === club.id && term.status === 'RUNNING')).toHaveLength(1)
    expect(club.currentTerm?.endOn).toBe(firstTermEnd(club.currentTerm?.startOn ?? ''))

    const me = await accountRepository.getMe()
    expect(me.memberships.find((membership) => membership.clubId === club.id)).toMatchObject({ memberStatus: 'ACTIVE', positionTitles: ['Chủ nhiệm'] })
    const directory = await clubRepository.directory({ q: 'Nhiếp ảnh' })
    expect(directory.content.map((entry) => entry.id)).toContain(club.id)
  })

  it('refuses incomplete information field by field', async () => {
    signInAs('u-ha')
    const error = await fail(clubRepository.create({ name: 'AB', shortName: 'N', field: '', description: 'ngắn' }))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field).sort()).toEqual(['description', 'field', 'name', 'shortName'])
  })

  it('ends the first term the day before the same date next year', () => {
    expect(firstTermEnd('2026-11-05')).toBe('2027-11-04')
    expect(firstTermEnd('2028-02-29')).toBe('2029-02-28')
  })
})

describe('club directory (SRS 3.5)', () => {
  it('shows public contacts to people outside the club', async () => {
    signInAs('u-quan')
    const entry = (await clubRepository.directory({ q: 'Guitar' })).content.find((club) => club.id === 'c-guitar')
    expect(entry).toMatchObject({ contactEmail: 'guitar.gsv@demo.test' })
    expect(entry).toHaveProperty('contactPhone')
    expect(entry).toHaveProperty('contactUrl')
  })
})

describe('useCreateClubViewModel (FR-CLB-01)', () => {
  const render = () => {
    signInAs('u-ha')
    const { wrapper, queryClient } = createTestWrapper('/me/clubs')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const onDone = vi.fn()
    const hook = renderHook(() => ({ vm: useCreateClubViewModel(onDone), location: useLocation() }), { wrapper })
    act(() => {
      hook.result.current.vm.form.setValue('name', newClub.name)
      hook.result.current.vm.form.setValue('shortName', newClub.shortName)
      hook.result.current.vm.form.setValue('field', newClub.field)
      hook.result.current.vm.form.setValue('description', newClub.description)
    })
    return { ...hook, invalidate, onDone }
  }

  it('refreshes the session and opens the new club once the server confirms', async () => {
    const { result, invalidate, onDone } = render()
    await act(() => result.current.vm.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    const created = db.clubs.find((club) => club.name === newClub.name)
    expect(result.current.location.pathname).toBe(`/clubs/${created?.id ?? ''}`)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionQueryKey })
  })

  it('puts a server field error on its field and stays on the form', async () => {
    server.use(
      http.post('*/api/v1/clubs', () => problem(400, 'Thông tin CLB chưa hợp lệ.', 'VALIDATION', [{ field: 'shortName', message: 'Tên viết tắt đã bị chặn.' }])),
    )
    const { result, onDone } = render()
    await act(() => result.current.vm.submit())
    await waitFor(() => expect(result.current.vm.form.getFieldState('shortName').error?.message).toBe('Tên viết tắt đã bị chặn.'))
    expect(result.current.vm.errorMessage).toBeNull()
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.location.pathname).toBe('/me/clubs')
  })

  it('shows the error when the request fails without field errors', async () => {
    server.use(http.post('*/api/v1/clubs', () => problem(500, 'Máy chủ đang bận.', 'INTERNAL')))
    const { result, onDone } = render()
    await act(() => result.current.vm.submit())
    await waitFor(() => expect(result.current.vm.errorMessage).not.toBeNull())
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('club profile (FR-CLB-02, NFR-SEC-03, NFR-REL-03)', () => {
  const update = (club: ClubDetail, overrides: Partial<Parameters<typeof clubRepository.update>[1]> = {}) =>
    clubRepository.update(club.id, {
      name: club.name,
      shortName: club.shortName,
      field: club.field,
      description: club.description,
      contactEmail: club.contactEmail,
      contactPhone: club.contactPhone,
      contactUrl: club.contactUrl,
      rules: club.rules,
      collectsStudentId: club.collectsStudentId,
      version: club.version,
      ...overrides,
    })

  it('lets the board edit contacts and refuses a stale version', async () => {
    signInAs('u-mai')
    const club = await clubRepository.getClub('c-guitar')
    expect(club.allowedActions).toContain('EDIT_CLUB')
    const saved = await update(club, { contactPhone: '0283 725 2002', contactUrl: 'https://example.com/gsv' })
    expect(saved).toMatchObject({ contactPhone: '02837252002', contactUrl: 'https://example.com/gsv', version: club.version + 1 })
    expect((await fail(update(club, { name: 'Ghi đè' })))?.status).toBe(409)
    expect(guitar()?.name).toBe('CLB Guitar Sinh viên')
  })

  it('refuses members outside the board, with the reason, and changes nothing', async () => {
    signInAs('u-ha')
    const club = await clubRepository.getClub('c-guitar')
    expect(club.allowedActions).not.toContain('EDIT_CLUB')
    const error = await fail(update(club, { name: 'CLB bị đổi tên' }))
    expect(error?.status).toBe(403)
    expect(error?.detail).toContain('ban chủ nhiệm')
    expect(guitar()?.version).toBe(club.version)
  })

  it('refuses a contact link that is not http or https', async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const error = await fail(update(club, { contactUrl: 'javascript:alert(1)' }))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field)).toEqual(['contactUrl'])
  })

  it('checks contacts with the same rules as the form', async () => {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const error = await fail(update(club, { contactUrl: 'https://.abc', contactEmail: 'a@b' }))
    expect(error?.fieldErrors.map((fieldError) => fieldError.field).sort()).toEqual(['contactEmail', 'contactUrl'])
  })

  it('refuses a logo upload from members outside the board and changes nothing', async () => {
    signInAs('u-ha')
    const before = { logoUrl: guitar()?.logoUrl, version: guitar()?.version }
    // Quyền được kiểm tra trước khi đọc tệp, nên gửi thân rỗng là đủ (FormData không chạy trong Vitest).
    const error = await fail(httpClient.post('/clubs/c-guitar/logo', {}))
    expect(error?.status).toBe(403)
    expect({ logoUrl: guitar()?.logoUrl, version: guitar()?.version }).toEqual(before)
  })

  it('hides student IDs once the club stops collecting them (SRS 3.5)', async () => {
    signInAs('u-anh')
    const before = await memberRepository.list('c-guitar', {})
    expect(before.content.some((member) => member.studentId !== null)).toBe(true)
    await update(await clubRepository.getClub('c-guitar'), { collectsStudentId: false })
    const after = await memberRepository.list('c-guitar', {})
    expect(after.content.every((member) => member.studentId === null)).toBe(true)
  })
})

describe('useClubProfileViewModel (FR-CLB-02)', () => {
  it('shows a conflict instead of overwriting when the club changed during editing', async () => {
    signInAs('u-anh')
    const start = await clubRepository.getClub('c-guitar')
    const { wrapper: Base } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club: start }}>{children}</ClubContext.Provider>
      </Base>
    )
    const { result } = renderHook(() => useClubProfileViewModel(() => {}), { wrapper })
    act(() => result.current.form.setValue('contactEmail', 'moi@demo.test', { shouldDirty: true }))
    const club = guitar()
    if (club) Object.assign(club, { name: 'Tên do người khác sửa', version: club.version + 1 })

    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(guitar()?.contactEmail).toBe('guitar.gsv@demo.test')
    await act(() => result.current.reload())
    expect(result.current.form.getValues('name')).toBe('Tên do người khác sửa')
    expect(result.current.conflict).toBe(false)
  })

  it('refreshes member lists after saving, so turning off student IDs hides them at once', async () => {
    signInAs('u-anh')
    const start = await clubRepository.getClub('c-guitar')
    const { wrapper: Base, queryClient } = createTestWrapper()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club: start }}>{children}</ClubContext.Provider>
      </Base>
    )
    const onDone = vi.fn()
    const { result } = renderHook(() => useClubProfileViewModel(onDone), { wrapper })
    act(() => result.current.form.setValue('collectsStudentId', false, { shouldDirty: true }))
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(guitar()?.collectsStudentId).toBe(false)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: memberQueryKeys.all })
  })
})

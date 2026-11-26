import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { publicClubRepository } from '../model/publicClubRepository'
import { usePublicClubViewModel, usePublicDirectoryViewModel } from './usePublicClubViewModels'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

describe('danh bạ CLB công khai (FR-CLB-05, SRS 3.5)', () => {
  it('khách chưa đăng nhập vẫn xem được, chỉ có trường công khai', async () => {
    const page = await publicClubRepository.list({})
    expect(page.content.map((club) => club.id)).toEqual(['c-guitar', 'c-english', 'c-volunteer'])
    const guitar = page.content[0]
    expect(Object.keys(guitar ?? {}).toSorted()).toEqual(
      ['contactEmail', 'contactPhone', 'contactUrl', 'description', 'field', 'id', 'logoUrl', 'name', 'openRecruitmentCount', 'shortName'].toSorted(),
    )
    expect(guitar?.openRecruitmentCount).toBe(1)
  })

  it('tìm theo tên, tên viết tắt và lọc đúng lĩnh vực', async () => {
    expect((await publicClubRepository.list({ q: 'tieng anh' })).content.map((club) => club.id)).toEqual(['c-english'])
    expect((await publicClubRepository.list({ q: 'GSV' })).content.map((club) => club.id)).toEqual(['c-guitar'])
    expect((await publicClubRepository.list({ field: 'Tình nguyện' })).content.map((club) => club.id)).toEqual(['c-volunteer'])
    expect(await publicClubRepository.fields()).toEqual(['Âm nhạc', 'Ngoại ngữ', 'Tình nguyện'])
  })

  it('trang CLB có đợt tuyển đang mở, không có sĩ số, nội quy hay cơ cấu', async () => {
    const guitar = await publicClubRepository.get('c-guitar')
    expect(guitar.openRecruitments).toEqual([
      expect.objectContaining({ id: 'rec-guitar-k1', departments: expect.arrayContaining([expect.objectContaining({ name: 'Chuyên môn', quota: 5 })]) }),
    ])
    expect(guitar).not.toHaveProperty('memberCount')
    expect(guitar).not.toHaveProperty('rules')
    expect((await publicClubRepository.get('c-english')).openRecruitments).toEqual([])
  })

  it('đợt tuyển chưa mở hoặc đã đóng không hiện', async () => {
    const recruitment = db.recruitments.find((candidate) => candidate.id === 'rec-guitar-k1')
    if (!recruitment) throw new Error('Thiếu rec-guitar-k1')
    recruitment.closedAt = recruitment.opensAt
    expect((await publicClubRepository.get('c-guitar')).openRecruitments).toEqual([])
    expect((await publicClubRepository.list({ q: 'guitar' })).content[0]?.openRecruitmentCount).toBe(0)
  })

  it('CLB không có thì 404', async () => {
    expect(await fail(publicClubRepository.get('c-khong-co'))).toMatchObject({ status: 404, code: 'CLUB_NOT_FOUND' })
  })
})

describe('usePublicDirectoryViewModel', () => {
  it('lọc lĩnh vực về trang đầu, bỏ lọc thì hiện lại đủ', async () => {
    const { wrapper } = createTestWrapper('/explore')
    const { result } = renderHook(() => usePublicDirectoryViewModel(), { wrapper })
    await waitFor(() => expect(result.current.clubs).toHaveLength(3))
    await waitFor(() => expect(result.current.fields).toHaveLength(3))

    act(() => result.current.setField('Ngoại ngữ'))
    await waitFor(() => expect(result.current.clubs.map((club) => club.id)).toEqual(['c-english']))
    expect(result.current.filtered).toBe(true)
    act(() => result.current.clearFilters())
    await waitFor(() => expect(result.current.clubs).toHaveLength(3))
    expect(result.current.filtered).toBe(false)
  })
})

describe('usePublicClubViewModel', () => {
  it('biết người xem đã đăng nhập hay chưa để gợi ý bước tiếp', async () => {
    const guest = renderHook(() => usePublicClubViewModel('c-guitar'), { wrapper: createTestWrapper('/explore/c-guitar').wrapper })
    await waitFor(() => expect(guest.result.current.club?.name).toBe('CLB Guitar Sinh viên'))
    expect(guest.result.current.signedIn).toBe(false)

    signInAs('u-tu')
    const member = renderHook(() => usePublicClubViewModel('c-guitar'), { wrapper: createTestWrapper('/explore/c-guitar').wrapper })
    await waitFor(() => expect(member.result.current.signedIn).toBe(true))
    expect(member.result.current.isAdmin).toBe(false)
  })
})

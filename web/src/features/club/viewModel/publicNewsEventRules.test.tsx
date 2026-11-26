import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/apiError'
import { db } from '@/api/mocks/db'
import { publicEventRepository } from '@/features/event/model/publicEventRepository'
import { publicSeatsText } from '@/features/event/viewModel/eventDisplay'
import { usePublicEventViewModel } from '@/features/event/viewModel/usePublicEventViewModel'
import { createTestWrapper, signInAs } from '@/testUtils'
import { publicClubRepository } from '../model/publicClubRepository'
import { usePublicNewsViewModel } from './usePublicClubViewModels'

const fail = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught as ApiError)

describe('trang công khai của CLB (FR-CLB-07)', () => {
  it('có tin đã xuất bản (không ghi người viết) và sự kiện mở cho khách', async () => {
    const guitar = await publicClubRepository.get('c-guitar')
    expect(guitar.news.map((news) => news.id)).toEqual(['news-winter-show', 'news-workshop'])
    expect(Object.keys(guitar.news[0] ?? {}).toSorted()).toEqual(['excerpt', 'id', 'imageUrl', 'publishedAt', 'title'])
    expect(guitar.guestEvents.map((event) => event.id)).toEqual(['e-winter'])
    expect(guitar.guestEvents[0]).toMatchObject({ clubName: 'CLB Guitar Sinh viên', capacity: 12 })
    expect((await publicClubRepository.get('c-english')).news).toEqual([])
  })

  it('tin nháp, tin đã ẩn không mở được trên trang công khai', async () => {
    expect(await publicClubRepository.newsDetail('c-guitar', 'news-workshop')).toMatchObject({ clubName: 'CLB Guitar Sinh viên', body: expect.stringContaining('workshop') })
    expect(await fail(publicClubRepository.newsDetail('c-guitar', 'news-recap-draft'))).toMatchObject({ status: 404 })
    expect(await fail(publicClubRepository.newsDetail('c-guitar', 'news-old-hidden'))).toMatchObject({ status: 404 })
    expect((await publicClubRepository.news('c-guitar')).totalElements).toBe(2)
  })

  it('trang sự kiện chỉ có với sự kiện mở cho khách của CLB còn hoạt động', async () => {
    const winter = await publicEventRepository.get('e-winter')
    expect(winter).toMatchObject({ registrationOpen: true, clubShortName: 'GSV' })
    expect(Object.keys(winter)).not.toContain('lead')
    expect(await fail(publicEventRepository.get('e-workshop'))).toMatchObject({ status: 404 })
    const club = db.clubs.find((candidate) => candidate.id === 'c-guitar')
    if (club) club.status = 'SUSPENDED'
    expect(await fail(publicEventRepository.get('e-winter'))).toMatchObject({ status: 404 })
  })

  it('publicSeatsText theo số chỗ còn lại', () => {
    expect(publicSeatsText({ capacity: null, seatsLeft: null })).toBe('Không giới hạn chỗ')
    expect(publicSeatsText({ capacity: 12, seatsLeft: 3 })).toBe('Còn 3/12 chỗ')
    expect(publicSeatsText({ capacity: 12, seatsLeft: 0 })).toBe('Đã hết chỗ, đăng ký mới vào danh sách chờ')
  })
})

describe('view model trang công khai', () => {
  it('thành viên CLB được gợi ý mở sự kiện trong ứng dụng; khách thì không', async () => {
    const guest = renderHook(() => usePublicEventViewModel('e-winter'), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(guest.result.current.event).not.toBeNull())
    expect(guest.result.current.appPath).toBeNull()

    signInAs('u-ha')
    const member = renderHook(() => usePublicEventViewModel('e-winter'), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(member.result.current.appPath).toBe('/clubs/c-guitar/events/e-winter'))
  })

  it('trang tin kèm tối đa 3 tin khác, không lặp tin đang đọc', async () => {
    const { result } = renderHook(() => usePublicNewsViewModel('c-guitar', 'news-workshop'), { wrapper: createTestWrapper().wrapper })
    await waitFor(() => expect(result.current.others.map((news) => news.id)).toEqual(['news-winter-show']))
  })
})

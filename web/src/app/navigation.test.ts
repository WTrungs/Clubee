import { describe, expect, it } from 'vitest'
import { buildNavigation } from './navigation'

const labels = (sections: ReturnType<typeof buildNavigation>) => sections.map((section) => [section.title, section.items.map((item) => item.label)])

describe('buildNavigation', () => {
  it('gives an admin only the admin area, never personal or club items (SRS 3.4)', () => {
    expect(labels(buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'ADMIN'))).toEqual([['Quản trị hệ thống', ['Số liệu', 'Tài khoản', 'Chuyển quyền']]])
  })

  it('gives a member the personal items, plus the club items when a club is open', () => {
    expect(labels(buildNavigation(undefined, undefined))).toEqual([['Cá nhân', ['CLB của tôi', 'Tìm CLB', 'Công việc của tôi', 'Quét mã điểm danh']]])
    const inClub = buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER')
    expect(inClub[1]?.title).toBe('CLB Guitar Sinh viên')
    expect(inClub[1]?.items[0]).toMatchObject({ to: '/clubs/c-guitar', label: 'Tổng quan' })
  })
})

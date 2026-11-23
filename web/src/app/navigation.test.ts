import { describe, expect, it } from 'vitest'
import { buildNavigation } from './navigation'

const labels = (sections: ReturnType<typeof buildNavigation>) => sections.map((section) => [section.title, section.items.map((item) => item.label)])

describe('buildNavigation', () => {
  it('gives an admin only the admin area, never personal or club items (SRS 3.4)', () => {
    expect(labels(buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'ADMIN'))).toEqual([['Quản trị hệ thống', ['Số liệu', 'Tài khoản', 'Chuyển quyền']]])
  })

  it('gives a member the personal items, plus the club items when a club is open', () => {
    expect(labels(buildNavigation(undefined, undefined))).toEqual([['Cá nhân', ['CLB của tôi', 'Tìm CLB', 'Công việc của tôi', 'Lịch của tôi', 'Hoạt động của tôi', 'Quét mã điểm danh']]])
    const inClub = buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER')
    expect(inClub[1]?.title).toBe('CLB Guitar Sinh viên')
    expect(inClub[1]?.items[0]).toMatchObject({ to: '/clubs/c-guitar', label: 'Tổng quan' })
  })

  it('shows recruitment only to those the server lets manage it (FR-REC-01)', () => {
    const member = buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER', 'MEMBER', [])
    expect(labels(member)[1]?.[1]).not.toContain('Tuyển thành viên')
    const board = buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER', 'MEMBER', ['MANAGE_RECRUITMENT'])
    expect(board[1]?.items.at(-1)).toMatchObject({ to: '/clubs/c-guitar/recruitments', label: 'Tuyển thành viên' })
  })

  it('shows Reports with any one of the report permissions (FR-RPT-03, 04, 06)', () => {
    expect(labels(buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER', 'MEMBER', []))[1]?.[1]).not.toContain('Báo cáo')
    for (const action of ['VIEW_CLUB_REPORT', 'VIEW_DEPARTMENT_REPORTS', 'VIEW_AUDIT_LOG'] as const) {
      const items = buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER', 'MEMBER', [action])[1]?.items ?? []
      expect(items.find((item) => item.label === 'Báo cáo')?.to).toBe('/clubs/c-guitar/reports')
    }
  })

  it('gives an event guest only the Events item of the host club (FR-EVT-07, SRS 3.5)', () => {
    const guest = buildNavigation('c-guitar', 'CLB Guitar Sinh viên', 'USER', 'EVENT_GUEST')
    expect(labels(guest)[1]).toEqual(['CLB Guitar Sinh viên', ['Sự kiện']])
    expect(guest[1]?.items[0]?.to).toBe('/clubs/c-guitar/events')
  })
})

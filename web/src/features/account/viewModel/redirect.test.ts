import { describe, expect, it } from 'vitest'
import { ADMIN_HOME, DEFAULT_AFTER_LOGIN, resolveRedirect } from './redirect'

describe('resolveRedirect', () => {
  it('returns the internal path the user wanted', () => {
    expect(resolveRedirect({ from: '/clubs/c-guitar/events?tab=staff' })).toBe('/clubs/c-guitar/events?tab=staff')
  })

  it('falls back to the club list for missing or unsafe targets', () => {
    expect(resolveRedirect(null)).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({})).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({ from: 42 })).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({ from: 'https://evil.example' })).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({ from: '//evil.example' })).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({ from: '/\\evil.example' })).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({ from: '/login' })).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('keeps each account type on its own pages (SRS 3.4)', () => {
    // Phiên trước là Admin, người đăng nhập sau là thành viên.
    expect(resolveRedirect({ from: '/admin/accounts' }, 'USER')).toBe(DEFAULT_AFTER_LOGIN)
    expect(resolveRedirect({ from: '/administrator' }, 'USER')).toBe('/administrator')
    expect(resolveRedirect(null, 'ADMIN')).toBe(ADMIN_HOME)
    expect(resolveRedirect({ from: '/clubs/c-guitar' }, 'ADMIN')).toBe(ADMIN_HOME)
    expect(resolveRedirect({ from: '/admin/accounts' }, 'ADMIN')).toBe('/admin/accounts')
    expect(resolveRedirect({ from: '/notifications?unread=1' }, 'ADMIN')).toBe('/notifications?unread=1')
    expect(resolveRedirect({ from: '//evil.example' }, 'ADMIN')).toBe(ADMIN_HOME)
  })
})

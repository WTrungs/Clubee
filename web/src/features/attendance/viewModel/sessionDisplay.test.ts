import { describe, expect, it } from 'vitest'
import { capacityLabel, scopeFilterQuery, sessionScopeLabel, sessionTiming } from './sessionDisplay'

describe('sessionDisplay', () => {
  const session = { startAt: '2026-11-10T18:00:00+07:00', endAt: '2026-11-10T20:00:00+07:00', attendanceClosed: false }

  it('derives the timing label from start, end and whether attendance is closed', () => {
    expect(sessionTiming(session, Date.parse('2026-11-10T17:59:00+07:00'))).toBe('UPCOMING')
    expect(sessionTiming(session, Date.parse('2026-11-10T18:00:00+07:00'))).toBe('ONGOING')
    expect(sessionTiming(session, Date.parse('2026-11-10T20:00:00+07:00'))).toBe('ENDED')
    expect(sessionTiming({ ...session, attendanceClosed: true }, Date.parse('2026-11-10T19:00:00+07:00'))).toBe('CLOSED')
  })

  it('names the scope and the seats', () => {
    expect(sessionScopeLabel({ type: 'CLUB', departmentId: null, departmentName: null })).toBe('Toàn CLB')
    expect(sessionScopeLabel({ type: 'DEPARTMENT', departmentId: 'd-media', departmentName: 'Truyền thông' })).toBe('Ban Truyền thông')
    expect(capacityLabel(null)).toBe('Không giới hạn')
    expect(capacityLabel(30)).toBe('30 chỗ')
  })

  it('turns the scope filter into query parameters', () => {
    expect(scopeFilterQuery('')).toEqual({})
    expect(scopeFilterQuery('CLUB')).toEqual({ scopeType: 'CLUB' })
    expect(scopeFilterQuery('d-media')).toEqual({ scopeType: 'DEPARTMENT', departmentId: 'd-media' })
  })
})

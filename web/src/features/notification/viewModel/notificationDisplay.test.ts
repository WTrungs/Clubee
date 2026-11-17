import { describe, expect, it } from 'vitest'
import { notificationPath, opensInSheet, unreadBadge } from './notificationDisplay'

describe('notification target (FR-NOT-03, BR-SEC-02)', () => {
  it('maps each target to the page that checks permission itself', () => {
    expect(notificationPath({ type: 'TASK', clubId: 'c-guitar', id: 't-poster' })).toBe('/me/tasks?task=t-poster&taskClub=c-guitar')
    expect(notificationPath({ type: 'EVENT', clubId: 'c-guitar', id: 'e-winter' })).toBe('/clubs/c-guitar/events/e-winter')
    expect(notificationPath({ type: 'STRUCTURE', clubId: 'c-english', id: null })).toBe('/clubs/c-english/structure')
    expect(notificationPath({ type: 'CLUB', clubId: 'c-guitar', id: null })).toBe('/clubs/c-guitar')
    expect(notificationPath({ type: 'DIRECTORY', clubId: null, id: null })).toBe('/directory')
    expect(notificationPath({ type: 'FINANCE', clubId: 'c-guitar', id: 'tx-capo' })).toBe('/clubs/c-guitar/finance?tx=tx-capo')
    expect(notificationPath({ type: 'SESSION', clubId: 'c-guitar', id: 's-media-plan' })).toBe('/clubs/c-guitar/sessions/s-media-plan')
    expect(notificationPath({ type: 'TERM', clubId: 'c-guitar', id: null })).toBe('/clubs/c-guitar/terms')
    expect(notificationPath({ type: 'HANDOVER', clubId: 'c-guitar', id: 'h-1' })).toBe('/clubs/c-guitar/handovers/h-1')
    expect(notificationPath({ type: 'MEMBERS', clubId: 'c-guitar', id: 'leave' })).toBe('/clubs/c-guitar/members?tab=leave')
    expect(notificationPath({ type: 'MEMBERS', clubId: 'c-guitar', id: null })).toBe('/clubs/c-guitar/members')
    expect(notificationPath({ type: 'INVITATION', clubId: 'c-guitar', id: 'a/b c' })).toBe('/invite/a%2Fb%20c')
    expect(notificationPath({ type: 'INVITATION', clubId: 'c-guitar', id: null })).toBeNull()
  })

  it('has no page when the target is missing or incomplete', () => {
    expect(notificationPath(null)).toBeNull()
    expect(notificationPath({ type: 'EVENT', clubId: 'c-guitar', id: null })).toBeNull()
    expect(notificationPath({ type: 'CLUB', clubId: null, id: null })).toBeNull()
    expect(notificationPath({ type: 'FINANCE', clubId: 'c-guitar', id: null })).toBeNull()
    expect(notificationPath({ type: 'SESSION', clubId: 'c-guitar', id: null })).toBeNull()
    expect(notificationPath({ type: 'HANDOVER', clubId: 'c-guitar', id: null })).toBeNull()
    expect(notificationPath({ type: 'TERM', clubId: null, id: null })).toBeNull()
  })

  it('opens announcements and notices without a page in the sheet', () => {
    expect(opensInSheet({ kind: 'MANUAL', target: { type: 'CLUB', clubId: 'c-guitar', id: null } })).toBe(true)
    expect(opensInSheet({ kind: 'SYSTEM', target: null })).toBe(true)
    expect(opensInSheet({ kind: 'SYSTEM', target: { type: 'TASK', clubId: 'c-guitar', id: 't-poster' } })).toBe(false)
  })

  it('caps the bell badge', () => {
    expect(unreadBadge(0)).toBeNull()
    expect(unreadBadge(7)).toBe('7')
    expect(unreadBadge(150)).toBe('99+')
  })
})

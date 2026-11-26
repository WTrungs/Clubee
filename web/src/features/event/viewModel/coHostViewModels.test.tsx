import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import type { SharedEvent, StaffMember, Subcommittee } from '../model/eventTypes'
import { coHostNote, coHostStatusDisplay } from './eventDisplay'
import { groupSharedEvents, useCoHostInvitationsViewModel } from './useCoHostInvitationsViewModel'
import { useCoHostsViewModel } from './useCoHostsViewModel'
import { leadChoices, setLeadErrors, useSetLeadViewModel } from './useSetLeadViewModel'

const english = () => {
  const found = db.eventCoHosts.find((coHost) => coHost.id === 'ch-winter-english')
  if (!found) throw new Error('Thiếu lời mời seed')
  return found
}
const member = (id: string, kind: StaffMember['kind']): StaffMember => ({ id, fullName: id, departmentName: null, kind, homeClubName: null, overQuota: false })

describe('co-host display (ST-COH)', () => {
  it('names every state and explains the line under the club', () => {
    expect(Object.keys(coHostStatusDisplay)).toEqual(['SENT', 'ACCEPTED', 'DECLINED', 'REMOVED'])
    expect(coHostStatusDisplay.SENT).toMatchObject({ label: 'Chờ trả lời', invitationLabel: 'Chờ bạn trả lời' })
    const base = { staffCount: 0, decisionNote: null, removeReason: null }
    expect(coHostNote({ ...base, status: 'SENT' })).toBe('Ban chủ nhiệm CLB này chưa trả lời.')
    expect(coHostNote({ ...base, status: 'ACCEPTED' })).toBe('Chưa có nhân sự trong BTC')
    expect(coHostNote({ ...base, status: 'ACCEPTED', staffCount: 2 })).toBe('2 nhân sự trong BTC')
    expect(coHostNote({ ...base, status: 'DECLINED', decisionNote: 'Bận thi.' })).toBe('Lý do: Bận thi.')
    expect(coHostNote({ ...base, status: 'REMOVED', removeReason: 'Đổi kế hoạch.' })).toBe('Lý do gỡ: Đổi kế hoạch.')
  })

  it('groups invitations by what the board still has to do', () => {
    const item = (id: string, status: SharedEvent['status']) => ({ id, status }) as SharedEvent
    const groups = groupSharedEvents([item('a', 'SENT'), item('b', 'ACCEPTED'), item('c', 'DECLINED'), item('d', 'REMOVED')])
    expect([groups.pending, groups.active, groups.past].map((group) => group.map((entry) => entry.id))).toEqual([['a'], ['b'], ['c', 'd']])
  })

  it('offers only staff who may lead, and asks for a reason when replacing a lead', () => {
    expect(leadChoices({ members: [member('a', 'MEMBER'), member('b', 'COLLABORATOR'), member('c', 'CO_HOST')] }).map((choice) => choice.id)).toEqual(['a', 'c'])
    expect(setLeadErrors(false, '', '')).toEqual({ userId: 'Chọn người làm trưởng tiểu ban.' })
    expect(setLeadErrors(false, 'u-a', '')).toEqual({})
    expect(setLeadErrors(true, 'u-a', ' ngắn ')).toHaveProperty('reason')
    expect(setLeadErrors(true, 'u-a', 'Đổi người phụ trách.')).toEqual({})
  })
})

describe('useCoHostInvitationsViewModel (FR-EVT-08)', () => {
  it('accepts an invitation and moves it to the active group', async () => {
    signInAs('u-tu')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCoHostInvitationsViewModel('c-english', true), { wrapper })
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
    const [invitation] = result.current.pending
    if (!invitation) throw new Error('Thiếu lời mời')
    act(() => result.current.accept(invitation))
    await waitFor(() => expect(result.current.active.map((item) => item.id)).toEqual(['ch-winter-english']))
    expect(english().status).toBe('ACCEPTED')
  })

  it('reloads after a 409 so a stale invitation is not answered twice', async () => {
    signInAs('u-tu')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCoHostInvitationsViewModel('c-english', true), { wrapper })
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
    const [stale] = result.current.pending
    if (!stale) throw new Error('Thiếu lời mời')
    // Người khác trong ban chủ nhiệm vừa từ chối.
    Object.assign(english(), { status: 'DECLINED', decisionNote: 'Đã bàn trong ban.', version: english().version + 1 })
    act(() => result.current.openDecline(stale))
    act(() => result.current.confirmDecline('Lịch học dày tháng này.'))
    await waitFor(() => expect(result.current.past.map((item) => item.id)).toEqual(['ch-winter-english']))
    expect(result.current.declineTarget).toBeNull()
    expect(english().decisionNote).toBe('Đã bàn trong ban.')
  })

  it('is not loaded for someone outside the board', () => {
    signInAs('u-tam')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCoHostInvitationsViewModel('c-english', false), { wrapper })
    expect(result.current.loading).toBe(false)
    expect(result.current.total).toBe(0)
  })
})

describe('useCoHostsViewModel (FR-EVT-08)', () => {
  it('marks clubs that cannot be picked and sends an invitation', async () => {
    signInAs('u-bao')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCoHostsViewModel('c-guitar', 'e-winter', true), { wrapper })
    await waitFor(() => expect(result.current.coHosts).toHaveLength(1))
    act(() => result.current.openInvite())
    await waitFor(() => expect(result.current.options.length).toBeGreaterThan(0))
    const reasons = Object.fromEntries(result.current.options.map((option) => [option.id, option.blockedReason]))
    expect(reasons).toMatchObject({ 'c-guitar': 'CLB chủ trì', 'c-english': 'Đã mời, chờ trả lời', 'c-volunteer': null })

    act(() => result.current.select({ id: 'c-volunteer', name: 'Đội Tình nguyện Xanh' }))
    act(() => result.current.submitInvite())
    await waitFor(() => expect(result.current.inviteOpen).toBe(false))
    expect(result.current.coHosts.map((coHost) => coHost.club.id)).toContain('c-volunteer')
  })

  it('shows the server reason when someone else invited the same club first (409)', async () => {
    signInAs('u-bao')
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useCoHostsViewModel('c-guitar', 'e-winter', true), { wrapper })
    await waitFor(() => expect(result.current.coHosts).toHaveLength(1))
    act(() => result.current.openInvite())
    act(() => result.current.select({ id: 'c-volunteer', name: 'Đội Tình nguyện Xanh' }))
    await eventRepository.inviteCoHost('c-guitar', 'e-winter', { clubId: 'c-volunteer', message: '' })
    act(() => result.current.submitInvite())
    await waitFor(() => expect(result.current.inviteError).toBe('Đội Tình nguyện Xanh đang chờ trả lời sự kiện này.'))
    expect(result.current.inviteOpen).toBe(true)
    await waitFor(() => expect(result.current.coHosts).toHaveLength(2))
  })
})

describe('useSetLeadViewModel (FR-EVT-08)', () => {
  async function logistics(): Promise<Subcommittee> {
    const found = (await eventRepository.subcommittees('c-guitar', 'e-winter')).find((subcommittee) => subcommittee.id === 'sc-winter-logistics')
    if (!found) throw new Error('Thiếu tiểu ban Hậu cần')
    return found
  }

  it('checks the form before sending, then replaces the lead', async () => {
    signInAs('u-bao')
    const subcommittee = await logistics()
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useSetLeadViewModel('c-guitar', 'e-winter'), { wrapper })
    act(() => result.current.open(subcommittee))
    expect(result.current.hasLead).toBe(true)
    act(() => result.current.submit())
    expect(result.current.userIdError).toBe('Chọn người làm trưởng tiểu ban.')
    expect(result.current.reasonError).not.toBeNull()
    act(() => {
      result.current.setUserId('u-khoa')
      result.current.setReason('Trưởng cũ bận thi cuối kỳ.')
    })
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.target).toBeNull())
    expect((await logistics()).lead?.id).toBe('u-khoa')
  })

  it('puts a 422 on the person field and a 403 under the form', async () => {
    signInAs('u-bao')
    await eventRepository.addCollaborator('c-guitar', 'e-winter', 'sc-winter-logistics', 'tam.duong@demo.test')
    const subcommittee = await logistics()
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useSetLeadViewModel('c-guitar', 'e-winter'), { wrapper })
    act(() => result.current.open(subcommittee))
    act(() => {
      result.current.setUserId('u-tam')
      result.current.setReason('Đổi người phụ trách.')
    })
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.userIdError).toBe('Cộng tác viên không làm trưởng tiểu ban được.'))
    expect(result.current.target).not.toBeNull()

    // Ban chủ nhiệm vừa tắt quyền nhân sự sự kiện của Trưởng BTC.
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'EVENT_LEAD', permission: 'MANAGE_EVENT_STAFF', enabled: false, updatedBy: 'u-anh', updatedAt: new Date().toISOString() })
    act(() => result.current.setUserId('u-khoa'))
    act(() => result.current.submit())
    await waitFor(() => expect(result.current.formError).toMatch(/đổi trưởng tiểu ban/))
    expect(result.current.userIdError).toBeNull()
  })
})

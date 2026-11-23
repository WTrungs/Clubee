import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import { financeQueryKeys } from '@/features/finance/viewModel/financeQueryKeys'
import { taskQueryKeys } from '@/features/task/viewModel/taskQueryKeys'
import { createTestWrapper, signInAs } from '@/testUtils'
import { clubRepository } from '../model/clubRepository'
import type { ClubSettings } from '../model/clubTypes'
import { ClubContext } from './clubContext'
import { clubSettingsSchema, parseCount, toClubSettingsFormValues, toUpdateClubSettingsRequest, type ClubSettingsFormValues } from './clubSettingsSchema'
import { useClubSettingsViewModel } from './useClubSettingsViewModel'

const settings: ClubSettings = {
  probationStep: true,
  inviteLinkDays: 7,
  registrationCancelHours: 24,
  rescheduleConfirmHours: 48,
  attendanceLeadMinutes: 15,
  attendanceQrRotateSeconds: 30,
  attendanceEditHours: 48,
  taskReminderDays: 1,
  taskOverloadThreshold: 5,
  expenseReceiptThreshold: 1_500_000,
  advanceSettleDays: 14,
  semester1Start: '09-01',
  semester2Start: '02-01',
  summerStart: null,
  updatedAt: null,
  updatedBy: null,
  version: 3,
}
const values = (changes: Partial<ClubSettingsFormValues> = {}): ClubSettingsFormValues => ({ ...toClubSettingsFormValues(settings), ...changes })
const errorFields = (input: ClubSettingsFormValues) => {
  const parsed = clubSettingsSchema.safeParse(input)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))
}
const guitar = () => db.clubs.find((club) => club.id === 'c-guitar')

describe('clubSettingsSchema (FR-CLB-03)', () => {
  it('turns stored settings into form text and back', () => {
    expect(values()).toEqual({
      probationStep: true,
      inviteLinkDays: '7',
      registrationCancelHours: '24',
      rescheduleConfirmHours: '48',
      attendanceLeadMinutes: '15',
      attendanceQrRotateSeconds: '30',
      attendanceEditHours: '48',
      taskReminderDays: '1',
      taskOverloadThreshold: '5',
      expenseReceiptThreshold: '1.500.000',
      advanceSettleDays: '14',
      semester1Start: '01/09',
      semester2Start: '01/02',
      splitSummer: false,
      summerStart: '01/07',
    })
    expect(toUpdateClubSettingsRequest(values({ expenseReceiptThreshold: '0' }), 3)).toEqual({
      probationStep: true,
      inviteLinkDays: 7,
      registrationCancelHours: 24,
      rescheduleConfirmHours: 48,
      attendanceLeadMinutes: 15,
      attendanceQrRotateSeconds: 30,
      attendanceEditHours: 48,
      taskReminderDays: 1,
      taskOverloadThreshold: 5,
      expenseReceiptThreshold: 0,
      advanceSettleDays: 14,
      semester1Start: '09-01',
      semester2Start: '02-01',
      summerStart: null,
      version: 3,
    })
    // Bật tách kỳ hè thì gửi mốc hè; nhập 1/7 hay 01-07 đều hiểu là ngày 1 tháng 7.
    expect(toUpdateClubSettingsRequest(values({ splitSummer: true, summerStart: '1-7' }), 3).summerStart).toBe('07-01')
  })

  it('checks semester marks the same way as the server', () => {
    expect(errorFields(values({ semester1Start: '29/02', semester2Start: 'abc' }))).toEqual(['semester1Start', 'semester2Start'])
    expect(errorFields(values({ semester2Start: '1/9' }))).toEqual(['semester2Start'])
    // Mốc hè chỉ xét khi bật tách kỳ hè.
    expect(errorFields(values({ summerStart: '01/12' }))).toEqual([])
    expect(errorFields(values({ splitSummer: true, summerStart: '01/12' }))).toEqual(['summerStart'])
    expect(errorFields(values({ splitSummer: true, summerStart: '15/06' }))).toEqual([])
  })

  it('checks the new count settings at the edges', () => {
    expect(errorFields(values({ registrationCancelHours: '0', rescheduleConfirmHours: '1', taskReminderDays: '0', advanceSettleDays: '1' }))).toEqual([])
    expect(errorFields(values({ registrationCancelHours: '169', rescheduleConfirmHours: '0', taskReminderDays: '15', advanceSettleDays: '91' }))).toEqual([
      'registrationCancelHours',
      'rescheduleConfirmHours',
      'taskReminderDays',
      'advanceSettleDays',
    ])
  })

  it('accepts both ends of each range and rejects values just outside', () => {
    expect(errorFields(values({ inviteLinkDays: '1', attendanceLeadMinutes: '0', attendanceQrRotateSeconds: '10', attendanceEditHours: '1', expenseReceiptThreshold: '0' }))).toEqual([])
    expect(errorFields(values({ inviteLinkDays: '30', attendanceLeadMinutes: '120', attendanceQrRotateSeconds: '300', attendanceEditHours: '720', expenseReceiptThreshold: '100.000.000' }))).toEqual([])
    expect(errorFields(values({ inviteLinkDays: '31', attendanceLeadMinutes: '121', attendanceQrRotateSeconds: '9', attendanceEditHours: '721', expenseReceiptThreshold: '100.000.001' }))).toEqual([
      'inviteLinkDays',
      'attendanceLeadMinutes',
      'attendanceQrRotateSeconds',
      'attendanceEditHours',
      'expenseReceiptThreshold',
    ])
  })

  it('rejects empty, decimal and signed numbers', () => {
    expect(errorFields(values({ inviteLinkDays: '', expenseReceiptThreshold: '' }))).toEqual(['inviteLinkDays', 'expenseReceiptThreshold'])
    expect([parseCount('7.5'), parseCount('-3'), parseCount('1e2'), parseCount(' 12 ')]).toEqual([null, null, null, 12])
    expect(clubSettingsSchema.safeParse(values({ attendanceLeadMinutes: '0' })).success).toBe(true)
  })
})

describe('useClubSettingsViewModel (FR-CLB-03, NFR-REL-03)', () => {
  async function render(onDone = () => {}) {
    signInAs('u-anh')
    const club = await clubRepository.getClub('c-guitar')
    const start = await clubRepository.settings('c-guitar')
    const { wrapper: Base, queryClient } = createTestWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
      </Base>
    )
    return { queryClient, ...renderHook(() => useClubSettingsViewModel(start, onDone), { wrapper }) }
  }

  it('shows a conflict instead of overwriting when someone saved in between, then reloads their values', async () => {
    const { result } = await render()
    act(() => result.current.form.setValue('inviteLinkDays', '10', { shouldDirty: true }))
    const club = guitar()
    if (club) Object.assign(club, { attendanceLeadMinutes: 45, settingsVersion: club.settingsVersion + 1 })

    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.conflict).toBe(true))
    expect(guitar()?.inviteLinkDays).toBe(7)
    expect(result.current.errorMessage).toBeNull()

    await act(() => result.current.reload())
    expect(result.current.form.getValues('attendanceLeadMinutes')).toBe('45')
    expect(result.current.conflict).toBe(false)
  })

  it('saves, then refreshes finance so the expense form shows the new threshold', async () => {
    const onDone = vi.fn()
    const { result, queryClient } = await render(onDone)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    act(() => result.current.form.setValue('expenseReceiptThreshold', '500.000', { shouldDirty: true }))
    await act(() => result.current.submit())
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(guitar()?.expenseReceiptThreshold).toBe(500_000)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: financeQueryKeys.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: eventQueryKeys.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskQueryKeys.all })
  })
})

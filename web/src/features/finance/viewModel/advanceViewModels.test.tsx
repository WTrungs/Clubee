import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/api/mocks/db'
import { generalFundId } from '@/api/mocks/seed/financeSeed'
import { server } from '@/api/mocks/server'
import { clubRepository } from '@/features/club/model/clubRepository'
import { ClubContext } from '@/features/club/viewModel/clubContext'
import { createTestWrapper, signInAs } from '@/testUtils'
import { financeRepository } from '../model/financeRepository'
import { AdvanceDetailSheet } from '../view/AdvanceDetailSheet'
import { advanceStatusDisplay, defaultSettleBy, settleByText } from './advanceDisplay'
import { disburseSchema, proposeAdvanceSchema } from './advanceSchemas'
import { financeQueryKeys } from './financeQueryKeys'
import { useAdvanceActionsViewModel } from './useAdvanceActionsViewModel'

const seeded = () => {
  const found = db.advances.find((advance) => advance.id === 'adv-strings')
  if (!found) throw new Error('Thiếu tạm ứng seed')
  return found
}

async function clubSetup() {
  const club = await clubRepository.getClub('c-guitar')
  const { wrapper: Base, queryClient } = createTestWrapper('/clubs/c-guitar/finance')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <ClubContext.Provider value={{ clubId: 'c-guitar', club }}>{children}</ClubContext.Provider>
    </Base>
  )
  return { wrapper, queryClient }
}

async function clubWrapper() {
  return (await clubSetup()).wrapper
}

describe('advance display and schemas (FR-FIN-07)', () => {
  it('labels every state and words the deadline', () => {
    expect(Object.keys(advanceStatusDisplay)).toEqual(['PROPOSED', 'APPROVED', 'DISBURSED', 'PARTIALLY_SETTLED', 'SETTLED', 'REJECTED'])
    expect(settleByText({ status: 'DISBURSED', settleBy: '2026-12-01', overdue: false })).toBe('Quyết toán trước 01/12/2026')
    expect(settleByText({ status: 'DISBURSED', settleBy: '2026-11-01', overdue: true })).toBe('Quá hạn quyết toán từ 01/11/2026')
    expect(settleByText({ status: 'REJECTED', settleBy: '2026-12-01', overdue: false })).toBeNull()
    expect(defaultSettleBy(Date.parse('2026-11-18T03:00:00Z'), 14)).toBe('02/12/2026')
  })

  it('checks the proposal and the disbursement date', () => {
    const schema = proposeAdvanceSchema('2026-11-18', '2027-02-16')
    const ok = { amount: '300.000', category: 'PRINTING', purpose: 'In băng rôn', settleDate: '02/12/2026' }
    expect(schema.safeParse(ok).success).toBe(true)
    const fields = (values: object) => {
      const result = schema.safeParse({ ...ok, ...values })
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    }
    expect(fields({ amount: '0' })).toEqual(['amount'])
    expect(fields({ purpose: 'abc' })).toEqual(['purpose'])
    expect(fields({ settleDate: '17/11/2026' })).toEqual(['settleDate'])
    expect(fields({ settleDate: '17/02/2027' })).toEqual(['settleDate'])
    expect(fields({ settleDate: '2026-12-02' })).toEqual(['settleDate'])
    expect(disburseSchema('2026-11-18').safeParse({ disbursedDate: '19/11/2026' }).success).toBe(false)
    expect(disburseSchema('2026-11-18').safeParse({ disbursedDate: '18/11/2026' }).success).toBe(true)
  })
})

describe('useAdvanceActionsViewModel (FR-FIN-07)', () => {
  it('approves, and reloads instead of acting twice when someone else got there first (409)', async () => {
    signInAs('u-anh')
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useAdvanceActionsViewModel('adv-strings'), { wrapper })
    await waitFor(() => expect(result.current.canApprove).toBe(true))
    seeded().version += 1
    act(() => result.current.approve())
    await waitFor(() => expect(result.current.advance?.version).toBe(seeded().version))
    expect(seeded().status).toBe('PROPOSED')
    act(() => result.current.approve())
    await waitFor(() => expect(result.current.advance?.status).toBe('APPROVED'))
    expect(result.current.canApprove).toBe(false)
  })

  it('hides the approve buttons from the requester and reloads after a 403', async () => {
    signInAs('u-huy')
    const wrapper = await clubWrapper()
    const own = renderHook(() => useAdvanceActionsViewModel('adv-strings'), { wrapper })
    await waitFor(() => expect(own.result.current.advance).not.toBeNull())
    expect(own.result.current.canApprove).toBe(false)

    signInAs('u-anh')
    const anh = renderHook(() => useAdvanceActionsViewModel('adv-strings'), { wrapper: await clubWrapper() })
    await waitFor(() => expect(anh.result.current.canApprove).toBe(true))
    // Bảng phân quyền vừa tắt quyền duyệt chi của Chủ nhiệm.
    db.permissionOverrides.push({ clubId: 'c-guitar', role: 'PRESIDENT', permission: 'APPROVE_EXPENSE', enabled: false, updatedBy: 'u-huy', updatedAt: new Date().toISOString() })
    act(() => anh.result.current.approve())
    await waitFor(() => expect(anh.result.current.canApprove).toBe(false))
    expect(seeded().status).toBe('PROPOSED')
  })

  it('closes the disburse dialog and reloads when the fund cannot cover it (422)', async () => {
    Object.assign(seeded(), { status: 'APPROVED', approverId: 'u-anh', amount: 900_000_000 })
    signInAs('u-mai')
    const wrapper = await clubWrapper()
    const { result } = renderHook(() => useAdvanceActionsViewModel('adv-strings'), { wrapper })
    await waitFor(() => expect(result.current.canDisburse).toBe(true))
    act(() => result.current.openDisburse())
    await waitFor(() => expect(result.current.fundBalance).not.toBeNull())
    await act(async () => {
      await result.current.submitDisburse()
    })
    await waitFor(() => expect(result.current.dialog).toBeNull())
    expect(seeded().status).toBe('APPROVED')
  })

  it('never shows a cached balance in the disburse dialog, only one fetched after it opens (BR-FIN-08)', async () => {
    Object.assign(seeded(), { status: 'APPROVED', approverId: 'u-anh' })
    signInAs('u-mai')
    const { wrapper, queryClient } = await clubSetup()
    const general = generalFundId('c-guitar')
    const stale = await financeRepository.fund('c-guitar', general)
    queryClient.setQueryData(financeQueryKeys.fund('c-guitar', general), { ...stale, balance: 999 })
    const { result } = renderHook(() => useAdvanceActionsViewModel('adv-strings'), { wrapper })
    await waitFor(() => expect(result.current.canDisburse).toBe(true))
    act(() => result.current.openDisburse())
    expect(result.current.fundBalance).toBeNull()
    await waitFor(() => expect(result.current.fundBalance).toBe(5_470_000))
  })

  it('tells the treasurer when the balance cannot be loaded', async () => {
    Object.assign(seeded(), { status: 'APPROVED', approverId: 'u-anh' })
    server.use(http.get('*/api/v1/clubs/:clubId/funds/:fundId', () => HttpResponse.json({ detail: 'Máy chủ đang bận.' }, { status: 503, headers: { 'Content-Type': 'application/problem+json' } })))
    signInAs('u-mai')
    const { result } = renderHook(() => useAdvanceActionsViewModel('adv-strings'), { wrapper: await clubWrapper() })
    await waitFor(() => expect(result.current.canDisburse).toBe(true))
    act(() => result.current.openDisburse())
    await waitFor(() => expect(result.current.fundBalanceError).toBe('Máy chủ đang bận.'))
    expect(result.current.fundBalance).toBeNull()
  })
})

describe('AdvanceDetailSheet, disburse dialog (FR-FIN-07, BR-FIN-08)', () => {
  it('shows the fresh balance, checks the date, then records the disbursement', async () => {
    Object.assign(seeded(), { status: 'APPROVED', approverId: 'u-anh', version: 2 })
    signInAs('u-mai')
    const wrapper = await clubWrapper()
    render(<AdvanceDetailSheet advanceId="adv-strings" onClose={() => undefined} />, { wrapper })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ghi đã ứng' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ghi đã ứng' })
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(/sau khi ứng còn/))
    const date = within(dialog).getByRole('textbox', { name: /Ngày ứng/ })
    await user.clear(date)
    await user.type(date, '01/01/2099')
    await user.click(within(dialog).getByRole('button', { name: 'Ghi đã ứng' }))
    expect(await within(dialog).findByText('Ngày ứng không được sau hôm nay.')).toBeInTheDocument()
    await user.clear(date)
    await user.type(date, '01/11/2026')
    await user.click(within(dialog).getByRole('button', { name: 'Ghi đã ứng' }))
    await waitFor(() => expect(seeded().status).toBe('DISBURSED'))
    expect(seeded().disbursedOn).toBe('2026-11-01')
  })

  it('blocks the button when the balance is too low', async () => {
    Object.assign(seeded(), { status: 'APPROVED', approverId: 'u-anh', amount: 900_000_000 })
    signInAs('u-mai')
    const wrapper = await clubWrapper()
    render(<AdvanceDetailSheet advanceId="adv-strings" onClose={() => undefined} />, { wrapper })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Ghi đã ứng' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ghi đã ứng' })
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(/không đủ để ứng/))
    expect(within(dialog).getByRole('button', { name: 'Ghi đã ứng' })).toBeDisabled()
  })

  it('links a disbursed advance to the expense it posted', async () => {
    Object.assign(seeded(), { status: 'DISBURSED', approverId: 'u-anh', disbursedBy: 'u-mai', disbursedOn: '2026-11-10', disbursementTxId: 'tx-capo' })
    signInAs('u-mai')
    const onOpenTransaction = vi.fn()
    render(<AdvanceDetailSheet advanceId="adv-strings" onClose={() => undefined} onOpenTransaction={onOpenTransaction} />, { wrapper: await clubWrapper() })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Xem khoản chi đã ghi sổ' }))
    expect(onOpenTransaction).toHaveBeenCalledWith('tx-capo')
  })
})

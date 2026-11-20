import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db } from '@/api/mocks/db'
import { createTestWrapper, signInAs } from '@/testUtils'
import { eventRepository } from '../model/eventRepository'
import type { Subcommittee } from '../model/eventTypes'
import { collaboratorSchema, useAddCollaboratorViewModel } from './useAddCollaboratorViewModel'

async function logistics(): Promise<Subcommittee> {
  const found = (await eventRepository.subcommittees('c-guitar', 'e-winter')).find((subcommittee) => subcommittee.id === 'sc-winter-logistics')
  if (!found) throw new Error('Thiếu tiểu ban Hậu cần')
  return found
}

async function renderOpen() {
  signInAs('u-bao')
  const subcommittee = await logistics()
  const { wrapper } = createTestWrapper()
  const view = renderHook(() => useAddCollaboratorViewModel('c-guitar', 'e-winter'), { wrapper })
  act(() => view.result.current.open(subcommittee))
  return view
}

async function submit(result: { current: ReturnType<typeof useAddCollaboratorViewModel> }, email: string) {
  act(() => result.current.form.setValue('email', email))
  await act(async () => {
    await result.current.submit()
  })
}

describe('collaboratorSchema', () => {
  it('needs a well formed email', () => {
    expect(collaboratorSchema.safeParse({ email: '' }).success).toBe(false)
    expect(collaboratorSchema.safeParse({ email: 'abc' }).success).toBe(false)
    expect(collaboratorSchema.safeParse({ email: ' tam.duong@demo.test ' }).success).toBe(true)
  })
})

describe('useAddCollaboratorViewModel (FR-EVT-07)', () => {
  it('adds the account, then closes the dialog', async () => {
    const { result } = await renderOpen()
    await submit(result, 'tam.duong@demo.test')
    await waitFor(() => expect(result.current.target).toBeNull())
    expect(db.eventStaff.some((staff) => staff.userId === 'u-tam' && staff.kind === 'COLLABORATOR')).toBe(true)
  })

  it('puts the server reason on the email field when the account is a member or not found', async () => {
    const { result } = await renderOpen()
    await submit(result, 'kiet.ly@demo.test')
    await waitFor(() => expect(result.current.form.formState.errors.email?.message).toBe('Người này đang là thành viên CLB; dùng nút Mời để thêm như thành viên.'))
    expect(result.current.formError).toBeNull()
    expect(result.current.target?.id).toBe('sc-winter-logistics')

    await submit(result, 'nobody@demo.test')
    await waitFor(() => expect(result.current.form.formState.errors.email?.message).toBe('Không có tài khoản đang hoạt động nào dùng email này.'))
  })

  it('shows a duplicate as a form message and keeps the dialog open', async () => {
    signInAs('u-bao')
    await eventRepository.addCollaborator('c-guitar', 'e-winter', 'sc-winter-logistics', 'tam.duong@demo.test')
    const { result } = await renderOpen()
    await submit(result, 'tam.duong@demo.test')
    await waitFor(() => expect(result.current.formError).toBe('Người này đã là nhân sự của tiểu ban.'))
    expect(result.current.target).not.toBeNull()
  })
})

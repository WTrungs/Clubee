import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/testUtils'
import type { SessionScopeOption } from '../model/sessionTypes'
import { useSessionFormViewModel } from './useSessionFormViewModel'

const club: SessionScopeOption = { type: 'CLUB', departmentId: null, name: 'Toàn CLB' }
const media: SessionScopeOption = { type: 'DEPARTMENT', departmentId: 'd-media', name: 'Ban Truyền thông' }

describe('useSessionFormViewModel', () => {
  it('picks the first scope once the scopes arrive', async () => {
    const { wrapper } = createTestWrapper()
    const { result, rerender } = renderHook(({ scopes }) => useSessionFormViewModel('c-guitar', scopes, vi.fn()), {
      wrapper,
      initialProps: { scopes: [] as SessionScopeOption[] },
    })
    expect(result.current.canSubmit).toBe(false)
    rerender({ scopes: [club, media] })
    await waitFor(() => expect(result.current.scopeKey).toBe('CLUB'))
  })

  it('makes the user choose again when the chosen scope disappears, instead of switching to another one', async () => {
    const { wrapper } = createTestWrapper()
    const { result, rerender } = renderHook(({ scopes }) => useSessionFormViewModel('c-guitar', scopes, vi.fn()), {
      wrapper,
      initialProps: { scopes: [club, media] },
    })
    await waitFor(() => expect(result.current.scopeKey).toBe('CLUB'))

    rerender({ scopes: [media] })
    await waitFor(() => expect(result.current.scopeKey).toBe(''))
    await act(() => result.current.submit())
    expect(result.current.form.getFieldState('scopeKey').error?.message).toBe('Chọn phạm vi của buổi.')

    act(() => result.current.reset())
    await waitFor(() => expect(result.current.scopeKey).toBe('d-media'))
  })
})

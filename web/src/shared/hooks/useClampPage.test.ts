import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useClampPage } from './useClampPage'

describe('useClampPage', () => {
  it('moves back to the last page that still exists', () => {
    const setPage = vi.fn()
    renderHook(() => useClampPage(3, 2, setPage))
    expect(setPage).toHaveBeenCalledWith(1)
  })

  it('goes to the first page when the list becomes empty', () => {
    const setPage = vi.fn()
    renderHook(() => useClampPage(1, 0, setPage))
    expect(setPage).toHaveBeenCalledWith(0)
  })

  it('leaves a valid page or unknown page count alone', () => {
    const setPage = vi.fn()
    renderHook(() => useClampPage(1, 3, setPage))
    renderHook(() => useClampPage(2, undefined, setPage))
    renderHook(() => useClampPage(0, 0, setPage))
    expect(setPage).not.toHaveBeenCalled()
  })
})

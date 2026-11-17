import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { useEditBaseline } from './useEditBaseline'

interface Values {
  name: string
  phone: string
}

function setup(initial: { version: number; values: Values }) {
  return renderHook(
    ({ version, values }: { version: number; values: Values }) => {
      const form = useForm<Values>({ defaultValues: values })
      const baseline = useEditBaseline(form, version, values)
      return { form, baseline, dirty: form.formState.isDirty }
    },
    { initialProps: initial },
  )
}

describe('useEditBaseline (NFR-REL-03)', () => {
  it('takes a newer version when only fields outside the form changed', () => {
    const values = { name: 'Hà', phone: '' }
    const { result, rerender } = setup({ version: 1, values })
    act(() => result.current.form.setValue('phone', '0912345678', { shouldDirty: true }))
    rerender({ version: 2, values: { ...values } })
    expect(result.current.baseline.version()).toBe(2)
    expect(result.current.form.getValues('phone')).toBe('0912345678')
  })

  it('reloads an untouched form when its fields changed elsewhere', () => {
    const { result, rerender } = setup({ version: 1, values: { name: 'Hà', phone: '' } })
    rerender({ version: 2, values: { name: 'Hà mới', phone: '' } })
    expect(result.current.form.getValues('name')).toBe('Hà mới')
    expect(result.current.baseline.version()).toBe(2)
  })

  it('keeps the old version while the user is editing, so the server answers 409', () => {
    const { result, rerender } = setup({ version: 1, values: { name: 'Hà', phone: '' } })
    act(() => result.current.form.setValue('phone', '0912345678', { shouldDirty: true }))
    rerender({ version: 2, values: { name: 'Hà mới', phone: '' } })
    expect(result.current.baseline.version()).toBe(1)
    expect(result.current.form.getValues('name')).toBe('Hà')

    act(() => result.current.baseline.accept(3, { name: 'Hà mới', phone: '0912345678' }))
    expect(result.current.baseline.version()).toBe(3)
  })
})

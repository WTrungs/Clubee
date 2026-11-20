import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useRefreshMemberData } from '@/features/member/viewModel/useRefreshMemberData'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { orgRepository } from '../model/orgRepository'
import type { Department } from '../model/orgTypes'
import { departmentSchema, type DepartmentValues } from './departmentSchema'

const SERVER_FIELDS = ['name', 'description'] as const

/** FR-ORG-01: khai báo ban mới hoặc sửa tên, mô tả ban đang hoạt động; sửa trùng lúc thì 409 (NFR-REL-03). */
export function useDepartmentFormViewModel(editing: Department | null, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const defaults: DepartmentValues = { name: editing?.name ?? '', description: editing?.description ?? '' }
  const form = useForm<DepartmentValues>({ resolver: zodResolver(departmentSchema), defaultValues: defaults })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: DepartmentValues) =>
      editing
        ? orgRepository.updateDepartment(clubId, editing.id, { ...values, version: editing.version })
        : orgRepository.createDepartment(clubId, values),
    meta: { silentError: true },
    onSuccess: async (department) => {
      await refresh()
      toast.success(editing ? `Đã lưu thông tin ban ${department.name}.` : `Đã khai báo ban ${department.name}.`)
      onDone()
    },
    onError: (error) => {
      // 409: người khác vừa sửa ban; đóng form, tải lại để mở lại với bản mới nhất, không ghi đè (NFR-REL-03).
      if (isConflict(error)) {
        toast.error(getErrorMessage(error))
        void refresh()
        onDone()
        return
      }
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS))
    },
  })

  const error = mutation.error
  return {
    form,
    editing: editing !== null,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}

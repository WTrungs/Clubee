import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { useRefreshMemberData } from '@/features/member/viewModel/useRefreshMemberData'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { formatDate, parseVnDate } from '@/shared/format/formatDate'
import { orgRepository } from '../model/orgRepository'
import { assignPositionSchema, type AssignPositionValues } from './assignPositionSchema'
import { assignableRoles, needsDepartment, positionTitle } from './orgDisplay'
import { orgQueryKeys } from './orgQueryKeys'
import type { AssignPreset } from './useOrgStructureViewModel'

const SERVER_FIELDS = ['role', 'userId'] as const
const SERVER_RENAME = { scopeId: 'departmentId', startOn: 'startDate', endOn: 'endDate' } as const

/** FR-ORG-02: chọn chức vụ, phạm vi, người giữ (danh sách người đủ điều kiện do máy chủ trả, BR-ORG-01) và thời hạn trong nhiệm kỳ. */
export function useAssignPositionViewModel(preset: AssignPreset, onDone: () => void) {
  const { clubId, club } = useCurrentClub()
  const refresh = useRefreshMemberData(clubId)
  const term = club.currentTerm
  // Lấy ngày hôm nay một lần khi mở form, không gọi Date trong lúc render.
  const [openedAt] = useState(() => new Date())
  const schema = useMemo(() => assignPositionSchema(term ?? { startOn: '', endOn: '' }), [term])
  const roleOptions = assignableRoles(club.allowedActions.includes('ASSIGN_PRESIDENCY'))
  const presetRole = roleOptions.find((option) => option === preset.role)
  const form = useForm<AssignPositionValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: presetRole,
      departmentId: preset.departmentId ?? '',
      userId: preset.userId ?? '',
      startDate: formatDate(openedAt),
      endDate: term ? formatDate(term.endOn) : '',
    },
  })
  const [role, departmentId, userId] = useWatch({ control: form.control, name: ['role', 'departmentId', 'userId'] })
  const [serverErrorsApplied, setServerErrorsApplied] = useState(false)
  const scopeId = role ? (needsDepartment(role) ? departmentId : clubId) : ''

  const departments = useQuery({ queryKey: orgQueryKeys.departments(clubId, 'ACTIVE'), queryFn: () => orgRepository.departments(clubId, 'ACTIVE') })
  const candidates = useQuery({
    queryKey: orgQueryKeys.candidates(clubId, role ?? 'PRESIDENT', scopeId),
    queryFn: () => orgRepository.candidates(clubId, role ?? 'PRESIDENT', scopeId),
    enabled: Boolean(role && scopeId),
  })
  const presetEligible = !preset.userId || !candidates.data || candidates.data.some((candidate) => candidate.id === preset.userId)

  // Đổi chức vụ hoặc ban thì danh sách người đủ điều kiện đổi theo, nên bỏ người đã chọn để không gửi người đang bị ẩn.
  const clearPerson = () => {
    if (!preset.userId) form.setValue('userId', '')
  }

  const mutation = useMutation({
    mutationFn: (values: AssignPositionValues) =>
      orgRepository.assign(clubId, {
        role: values.role,
        scopeId: needsDepartment(values.role) ? values.departmentId : clubId,
        userId: values.userId,
        startOn: parseVnDate(values.startDate) ?? '',
        endOn: parseVnDate(values.endDate) ?? '',
      }),
    meta: { silentError: true },
    onSuccess: async (position) => {
      await refresh()
      toast.success(`Đã gán ${positionTitle(position)} cho ${position.holder.fullName}.`)
      onDone()
    },
    onError: (error) => {
      setServerErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS, SERVER_RENAME))
      // Người được chọn vừa nhận chức vụ này ở nơi khác: tải lại danh sách và bỏ lựa chọn cũ.
      if (isConflict(error)) {
        clearPerson()
        void refresh()
      }
    },
  })

  const error = mutation.error
  return {
    form,
    termMissing: term === null,
    termEnd: term?.endOn ?? null,
    lockedPerson: preset.userId ? { id: preset.userId, fullName: preset.userName ?? '' } : null,
    role: role ?? '',
    roleOptions,
    setRole: (value: AssignPositionValues['role'] | '') => {
      form.setValue('role', value as AssignPositionValues['role'], { shouldValidate: form.formState.isSubmitted })
      clearPerson()
    },
    departmentId,
    setDepartmentId: (value: string) => {
      form.setValue('departmentId', value, { shouldValidate: form.formState.isSubmitted })
      clearPerson()
    },
    userId,
    setUserId: (value: string) => form.setValue('userId', value, { shouldValidate: form.formState.isSubmitted }),
    needsDepartment: role ? needsDepartment(role) : false,
    departments: departments.data ?? [],
    candidates: candidates.data ?? [],
    candidatesLoading: candidates.isPending && candidates.fetchStatus !== 'idle',
    candidatesError: candidates.error ? getErrorMessage(candidates.error) : null,
    retryCandidates: () => void candidates.refetch(),
    /** Người mở sẵn từ hồ sơ thành viên không có trong danh sách đủ điều kiện của chức vụ, phạm vi đã chọn. */
    presetIneligible: !presetEligible,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(serverErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}

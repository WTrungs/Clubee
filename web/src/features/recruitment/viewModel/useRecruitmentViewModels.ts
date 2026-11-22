import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useFieldArray, useForm, type Path } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { orgRepository } from '@/features/org/model/orgRepository'
import { orgQueryKeys } from '@/features/org/viewModel/orgQueryKeys'
import { recruitmentRepository } from '../model/recruitmentRepository'
import type { RecruitmentDetail, UpdateRecruitmentRequest } from '../model/recruitmentTypes'
import { recruitmentFieldPath, recruitmentFormSchema, toRecruitmentFormValues, toRecruitmentRequest, type RecruitmentFormValues } from './recruitmentFormSchema'
import { recruitmentQueryKeys } from './recruitmentQueryKeys'

export const recruitmentPath = (clubId: string, recruitmentId: string) => `/clubs/${encodeURIComponent(clubId)}/recruitments/${encodeURIComponent(recruitmentId)}`

/** FR-REC-01: danh sách đợt tuyển của CLB cho người có quyền Quản lý thành viên. */
export function useRecruitmentsViewModel() {
  const { clubId, club } = useCurrentClub()
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const canManage = club.allowedActions.includes('MANAGE_RECRUITMENT')
  const list = useQuery({
    queryKey: recruitmentQueryKeys.list(clubId, page),
    queryFn: () => recruitmentRepository.list(clubId, page),
    enabled: canManage,
    placeholderData: keepPreviousData,
  })
  return {
    clubId,
    clubName: club.name,
    canManage,
    rows: list.data?.content ?? [],
    loading: canManage && list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: list.data?.size ?? 20,
    setPage,
    formOpen,
    openForm: () => setFormOpen(true),
    closeForm: () => setFormOpen(false),
    detailPath: (recruitmentId: string) => recruitmentPath(clubId, recruitmentId),
  }
}

/** FR-REC-01: chi tiết một đợt tuyển phía ban chủ nhiệm. */
export function useRecruitmentDetailViewModel() {
  const { clubId, club } = useCurrentClub()
  const { recruitmentId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const detail = useQuery({ queryKey: recruitmentQueryKeys.detail(clubId, recruitmentId), queryFn: () => recruitmentRepository.get(clubId, recruitmentId) })
  const canViewApplications = detail.data?.allowedActions.includes('VIEW_APPLICATIONS') ?? false
  const tabs = [{ value: 'info', label: 'Thông tin' }, ...(canViewApplications ? [{ value: 'applications', label: 'Đơn ứng tuyển' }, { value: 'rounds', label: 'Lọc theo vòng' }] : [])]
  const tab = tabs.find((candidate) => candidate.value === searchParams.get('tab'))?.value ?? 'info'
  return {
    tabs,
    tab,
    setTab: (value: string) => setSearchParams(value === 'info' ? {} : { tab: value }, { replace: true }),
    clubId,
    clubName: club.name,
    recruitment: detail.data ?? null,
    loading: detail.isPending,
    error: detail.error,
    refetch: () => void detail.refetch(),
    canEdit: detail.data?.allowedActions.includes('EDIT') ?? false,
    editOpen,
    openEdit: () => setEditOpen(true),
    closeEdit: () => setEditOpen(false),
  }
}

/** FR-REC-01: mở hoặc sửa đợt tuyển; sau giờ mở chỉ gửi phần còn sửa được (tên, mô tả, giờ đóng, chỉ tiêu, giám khảo). */
export function useRecruitmentFormViewModel(editing: RecruitmentDetail | null, onDone: () => void) {
  const { clubId } = useCurrentClub()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const locked = editing?.structureLocked ?? false
  const form = useForm<RecruitmentFormValues>({ resolver: zodResolver(recruitmentFormSchema), defaultValues: toRecruitmentFormValues(editing) })
  const quotas = useFieldArray({ control: form.control, name: 'quotas' })
  const rounds = useFieldArray({ control: form.control, name: 'rounds' })
  const questions = useFieldArray({ control: form.control, name: 'questions' })
  const departments = useQuery({ queryKey: orgQueryKeys.departments(clubId, 'ACTIVE'), queryFn: () => orgRepository.departments(clubId, 'ACTIVE') })
  const judges = useQuery({ queryKey: recruitmentQueryKeys.judges(clubId), queryFn: () => recruitmentRepository.judgeCandidates(clubId) })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.all })
  const mutation = useMutation({
    mutationFn: (values: RecruitmentFormValues) => {
      const request = toRecruitmentRequest(values)
      if (!editing) return recruitmentRepository.create(clubId, request)
      const update: UpdateRecruitmentRequest = locked
        ? { name: request.name, description: request.description, closesAt: request.closesAt, quotas: request.quotas, judgeIds: request.judgeIds, version: editing.version }
        : { ...request, version: editing.version }
      return recruitmentRepository.update(clubId, editing.id, update)
    },
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async (saved) => {
      await refresh()
      toast.success(editing ? `Đã lưu ${saved.name}.` : `Đã mở đợt tuyển ${saved.name}.`)
      onDone()
      if (!editing) void navigate(recruitmentPath(clubId, saved.id))
    },
    onError: (error) => {
      // Đợt vừa đổi ở nơi khác (409), đã mở hoặc đã chốt (422), mất quyền (403): báo, đóng và tải lại.
      if (isConflict(error) || isForbidden(error) || (error instanceof ApiError && error.status === 422)) {
        toast.error(getErrorMessage(error))
        void refresh()
        onDone()
        return
      }
      if (!(error instanceof ApiError)) return
      for (const fieldError of error.fieldErrors) form.setError(recruitmentFieldPath(fieldError.field) as Path<RecruitmentFormValues>, { type: 'server', message: fieldError.message })
      setFieldErrorsApplied(error.fieldErrors.length > 0)
    },
  })

  const error = mutation.error
  return {
    form,
    editing: editing !== null,
    locked,
    quotas,
    rounds,
    questions,
    // Ban, giám khảo đã lưu mà nay không còn hợp lệ vẫn hiện (kèm ghi chú) để bỏ được.
    departmentOptions: [
      ...(departments.data ?? []).map((department) => ({ id: department.id, name: department.name })),
      ...(editing?.quotas ?? [])
        .filter((quota) => departments.data !== undefined && !departments.data.some((department) => department.id === quota.departmentId))
        .map((quota) => ({ id: quota.departmentId, name: `${quota.departmentName} (đã đóng)` })),
    ],
    judgeOptions: [
      ...(judges.data ?? []).map((candidate) => ({ ...candidate, note: null as string | null })),
      ...(editing?.judges ?? [])
        .filter((judge) => judges.data !== undefined && !judges.data.some((candidate) => candidate.id === judge.id))
        .map((judge) => ({ id: judge.id, fullName: judge.fullName, departmentName: null, note: 'Không còn là thành viên Chính thức' })),
    ],
    optionsError: departments.error ?? judges.error,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}

export type RecruitmentFormViewModel = ReturnType<typeof useRecruitmentFormViewModel>

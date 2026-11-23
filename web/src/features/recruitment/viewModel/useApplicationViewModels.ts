import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm, type Path } from 'react-hook-form'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { recruitmentRepository } from '../model/recruitmentRepository'
import { sessionQueryKey } from '@/api/queryClient'
import type { AdmissionDecision, ApplicationQuery, ApplicationStatus, MyApplication, PublicRecruitment, RecruitmentDetail } from '../model/recruitmentTypes'
import { applicationFieldPath, applicationFormSchema, emptyApplication, toSubmitRequest, type ApplicationFormValues } from './applicationFormSchema'
import { recruitmentQueryKeys } from './recruitmentQueryKeys'

/** Rút đơn, nhận hoặc từ chối kết quả, dùng chung cho trang đợt tuyển và tab Đơn của tôi; 409 hoặc 422 thì báo và tải lại. */
function useWithdraw() {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<MyApplication | null>(null)
  const [respondTarget, setRespondTarget] = useState<{ application: MyApplication; decision: AdmissionDecision } | null>(null)
  // Giữ lựa chọn cuối để hộp thoại đang đóng không đổi chữ sang Từ chối.
  const [lastRespond, setLastRespond] = useState<{ application: MyApplication; decision: AdmissionDecision } | null>(null)
  // Nhận kết quả thì có CLB mới trong danh sách CLB của tôi.
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.all }), queryClient.invalidateQueries({ queryKey: sessionQueryKey })])
  const respond = useMutation({
    mutationFn: ({ application, decision }: { application: MyApplication; decision: AdmissionDecision }) => recruitmentRepository.respond(application.id, { decision, version: application.version }),
    meta: { silentError: true },
    onSuccess: async (saved, { decision }) => {
      await refresh()
      toast.success(decision === 'ACCEPT' ? `Đã nhận kết quả. Bạn đã là thành viên ${saved.recruitment.clubName}.` : 'Đã từ chối nhận kết quả.')
      setRespondTarget(null)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      setRespondTarget(null)
      void refresh()
    },
  })
  const mutation = useMutation({
    mutationFn: (application: MyApplication) => recruitmentRepository.withdraw(application.id, application.version),
    meta: { silentError: true },
    onSuccess: async (saved) => {
      await refresh()
      toast.success(`Đã rút đơn ứng tuyển ${saved.recruitment.name}.`)
      setTarget(null)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      setTarget(null)
      void refresh()
    },
  })
  return {
    respondTarget,
    askRespond: (application: MyApplication, decision: AdmissionDecision) => {
      setRespondTarget({ application, decision })
      setLastRespond({ application, decision })
    },
    lastRespond,
    closeRespond: () => !respond.isPending && setRespondTarget(null),
    confirmRespond: () => respondTarget && respond.mutate(respondTarget),
    respondPending: respond.isPending,
    withdrawTarget: target,
    askWithdraw: setTarget,
    closeWithdraw: () => !mutation.isPending && setTarget(null),
    confirmWithdraw: () => target && mutation.mutate(target),
    withdrawPending: mutation.isPending,
  }
}

/** FR-REC-02: đợt đang nhận đơn ở mọi CLB. */
export function useOpenRecruitmentsViewModel(enabled: boolean) {
  const [keyword, setKeyword] = useState('')
  const debounced = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const list = useQuery({ queryKey: recruitmentQueryKeys.open(debounced, page), queryFn: () => recruitmentRepository.openRecruitments(debounced || undefined, page), enabled, placeholderData: keepPreviousData })
  return {
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(0)
    },
    rows: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: list.data?.size ?? 20,
    setPage,
  }
}

/** FR-REC-02: đơn của tôi ở mọi đợt tuyển. */
export function useMyApplicationsViewModel(enabled: boolean) {
  const list = useQuery({ queryKey: recruitmentQueryKeys.mine, queryFn: () => recruitmentRepository.myApplications(), enabled })
  return { rows: list.data ?? [], loading: list.isPending, error: list.error, refetch: () => void list.refetch(), ...useWithdraw() }
}

/** FR-REC-02: trang đợt tuyển phía ứng viên: nộp đơn, xem trạng thái, rút đơn. */
export function useApplyViewModel() {
  const { recruitmentId = '' } = useParams()
  const detail = useQuery({ queryKey: recruitmentQueryKeys.public(recruitmentId), queryFn: () => recruitmentRepository.publicRecruitment(recruitmentId) })
  return { recruitment: detail.data ?? null, loading: detail.isPending, error: detail.error, refetch: () => void detail.refetch(), ...useWithdraw() }
}

/** Form nộp đơn; dựng lại khi có thông tin đợt để biết câu hỏi và có thu MSSV hay không. */
export function useApplicationFormViewModel(recruitment: PublicRecruitment) {
  const queryClient = useQueryClient()
  const schema = useMemo(() => applicationFormSchema(recruitment), [recruitment])
  const form = useForm<ApplicationFormValues>({ resolver: zodResolver(schema), defaultValues: emptyApplication(recruitment) })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: recruitmentQueryKeys.all })
  const mutation = useMutation({
    mutationFn: (values: ApplicationFormValues) => recruitmentRepository.apply(recruitment.id, toSubmitRequest(recruitment, values)),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: async () => {
      await refresh()
      toast.success('Đã nộp đơn. Theo dõi kết quả ở đây hoặc ở tab Đơn của tôi.')
    },
    onError: (error) => {
      // Đã có đơn (409), vừa thành thành viên hay hết giờ nhận đơn (422): tải lại để trang hiện đúng trạng thái.
      if (isConflict(error) || (error instanceof ApiError && error.status === 422)) {
        toast.error(getErrorMessage(error))
        void refresh()
        return
      }
      if (!(error instanceof ApiError)) return
      for (const fieldError of error.fieldErrors) form.setError(applicationFieldPath(fieldError.field) as Path<ApplicationFormValues>, { type: 'server', message: fieldError.message })
      setFieldErrorsApplied(error.fieldErrors.length > 0)
    },
  })
  const error = mutation.error
  return {
    form,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    errorMessage: error && !isConflict(error) && !(error instanceof ApiError && error.status === 422) && !(fieldErrorsApplied && error instanceof ApiError) ? getErrorMessage(error) : null,
  }
}

const PAGE_SIZE = 50

/** FR-REC-02: đơn của một đợt phía ban chủ nhiệm, lọc theo trạng thái, nguyện vọng, tên. */
export function useApplicationsViewModel(clubId: string, recruitment: RecruitmentDetail, enabled: boolean) {
  const [status, setStatus] = useState<ApplicationStatus | ''>('')
  const [departmentId, setDepartmentId] = useState('')
  const [keyword, setKeyword] = useState('')
  const debounced = useDebouncedValue(keyword.trim(), 300)
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const query: ApplicationQuery = { status: status || undefined, departmentId: departmentId || undefined, q: debounced || undefined, page }
  const list = useQuery({
    queryKey: recruitmentQueryKeys.applicationPage(clubId, recruitment.id, query),
    queryFn: () => recruitmentRepository.applications(clubId, recruitment.id, query),
    enabled,
    placeholderData: keepPreviousData,
  })
  const detail = useQuery({
    queryKey: recruitmentQueryKeys.application(clubId, detailId ?? ''),
    queryFn: () => recruitmentRepository.application(clubId, recruitment.id, detailId ?? ''),
    enabled: detailId !== null,
  })
  const reset = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(0)
  }
  return {
    status,
    setStatus: reset(setStatus),
    departmentId,
    setDepartmentId: reset(setDepartmentId),
    departments: recruitment.quotas.map((quota) => ({ id: quota.departmentId, name: quota.departmentName })),
    keyword,
    setKeyword: reset(setKeyword),
    rows: list.data?.content ?? [],
    loading: list.isPending,
    error: list.error,
    refetch: () => void list.refetch(),
    page: list.data?.page ?? 0,
    totalPages: list.data?.totalPages ?? 0,
    totalElements: list.data?.totalElements ?? 0,
    pageSize: PAGE_SIZE,
    setPage,
    detailId,
    openDetail: setDetailId,
    closeDetail: () => setDetailId(null),
    detail: detail.data ?? null,
    detailLoading: detail.isPending && detailId !== null,
    detailError: detail.error,
  }
}

export type ApplicationsViewModel = ReturnType<typeof useApplicationsViewModel>
export type WithdrawViewModel = ReturnType<typeof useWithdraw>

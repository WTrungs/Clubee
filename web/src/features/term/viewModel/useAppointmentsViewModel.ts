import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { memberRepository } from '@/features/member/model/memberRepository'
import type { MemberSummary } from '@/features/member/model/memberTypes'
import { memberQueryKeys } from '@/features/member/viewModel/memberQueryKeys'
import { needsDepartment } from '@/features/org/viewModel/orgDisplay'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { termRepository } from '../model/termRepository'
import type { Handover } from '../model/handoverTypes'
import { appointmentFieldPath, appointmentsSchema, APPOINTMENTS_MAX, NEW_APPOINTMENT, toAppointmentRequests, toAppointmentValues, type AppointmentsValues } from './appointmentsSchema'
import { termQueryKeys } from './termQueryKeys'

// Một CLB sinh viên hiếm khi vượt mức này; máy chủ vẫn kiểm tra lại người được chọn (BR-ORG-01).
const MEMBER_QUERY = { status: ['ACTIVE' as const], size: 200 }

/** FR-TERM-03: ghi kết quả bầu; chỉ thành viên Chính thức, trưởng, phó ban phải thuộc đúng ban (BR-ORG-01). */
export function useAppointmentsViewModel(handover: Handover, onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId } = useCurrentClub()
  const liveValues = useMemo(() => toAppointmentValues(handover.appointments), [handover.appointments])
  const form = useForm<AppointmentsValues>({ resolver: zodResolver(appointmentsSchema), defaultValues: liveValues })
  const rows = useFieldArray({ control: form.control, name: 'rows' })
  const baseline = useEditBaseline(form, handover.version, liveValues)
  const watched = useWatch({ control: form.control, name: 'rows' })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)
  const members = useQuery({ queryKey: memberQueryKeys.list(clubId, MEMBER_QUERY), queryFn: () => memberRepository.list(clubId, MEMBER_QUERY) })

  const mutation = useMutation({
    mutationFn: (values: AppointmentsValues) => termRepository.saveAppointments(clubId, handover.id, { appointments: toAppointmentRequests(values), version: baseline.version() }),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (saved) => {
      baseline.accept(saved.version, toAppointmentValues(saved.appointments))
      queryClient.setQueryData(termQueryKeys.handover(clubId, saved.id), saved)
      void queryClient.invalidateQueries({ queryKey: termQueryKeys.list(clubId) })
      toast.success('Đã lưu kết quả bầu.')
      onDone()
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      let applied = false
      for (const fieldError of error.fieldErrors) {
        const path = appointmentFieldPath(fieldError.field)
        if (!path) continue
        form.setError(path, { type: 'server', message: fieldError.message })
        applied = true
      }
      setFieldErrorsApplied(applied)
    },
  })

  const people = members.data?.content ?? []
  const peopleOf = (index: number): MemberSummary[] => {
    const row = watched?.[index]
    if (!row || !needsDepartment(row.role)) return people
    return people.filter((member) => member.department?.id === row.departmentId)
  }
  const conflict = isConflict(mutation.error)
  return {
    form,
    rows: rows.fields,
    departmentOptions: handover.departmentOptions,
    /** Người chọn được ở một dòng: ban chủ nhiệm lấy mọi thành viên Chính thức, trưởng, phó ban chỉ người của ban đó. */
    peopleFor: peopleOf,
    needsDepartment: (index: number) => needsDepartment(watched?.[index]?.role ?? ''),
    /** Người đã lưu ở dòng này mà không có trong danh sách chọn; máy chủ cho biết họ còn đủ điều kiện hay không. */
    savedChoice: (index: number) => {
      const row = watched?.[index]
      if (!row?.userId || peopleOf(index).some((member) => member.person.id === row.userId)) return null
      const departmentId = needsDepartment(row.role) ? row.departmentId : null
      const saved = handover.appointments.find(
        (appointment) => appointment.person.id === row.userId && appointment.role === row.role && (appointment.department?.id ?? null) === departmentId,
      )
      return saved ? { person: saved.person, eligible: saved.eligible } : null
    },
    peopleLoading: members.isPending,
    peopleError: members.error,
    canAdd: rows.fields.length < APPOINTMENTS_MAX,
    addRow: () => rows.append(NEW_APPOINTMENT, { focusName: `rows.${rows.fields.length}.role` }),
    removeRow: (index: number) => rows.remove(index),
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    reload: async () => {
      try {
        const fresh = await queryClient.fetchQuery({ queryKey: termQueryKeys.handover(clubId, handover.id), queryFn: () => termRepository.handover(clubId, handover.id), staleTime: 0 })
        const values = toAppointmentValues(fresh.appointments)
        baseline.accept(fresh.version, values)
        form.reset(values)
        mutation.reset()
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    },
    errorMessage: mutation.error && !conflict && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
  }
}

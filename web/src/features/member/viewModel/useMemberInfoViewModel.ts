import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, isConflict } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { toVnDateKey } from '@/shared/format/formatDate'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { useEditBaseline } from '@/shared/form/useEditBaseline'
import { memberRepository } from '../model/memberRepository'
import type { MemberDetail } from '../model/memberTypes'
import { memberInfoSchema, toMemberInfoValues, toUpdateMemberInfoRequest, type MemberInfoValues } from './memberInfoSchema'
import { memberQueryKeys } from './memberQueryKeys'

const SERVER_FIELDS = ['displayTitle', 'internalNote', 'studentId', 'joinedOn'] as const

/** FR-MEM-05: ban chủ nhiệm sửa chức danh, ghi chú, MSSV, ngày gia nhập; lệch `version` thì báo và cho tải lại, không ghi đè (NFR-REL-03). */
export function useMemberInfoViewModel(member: MemberDetail, onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId, club } = useCurrentClub()
  const [today] = useState(() => toVnDateKey(new Date()))
  const schema = useMemo(() => memberInfoSchema({ today, foundedOn: club.foundedOn, collectsStudentId: club.collectsStudentId }), [today, club.foundedOn, club.collectsStudentId])
  const liveValues = useMemo(() => toMemberInfoValues(member), [member])
  const form = useForm<MemberInfoValues>({ resolver: zodResolver(schema), defaultValues: liveValues })
  const baseline = useEditBaseline(form, member.version, liveValues)
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  const mutation = useMutation({
    mutationFn: (values: MemberInfoValues) => memberRepository.updateInfo(clubId, member.membershipId, toUpdateMemberInfoRequest(values, baseline.version())),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (saved) => {
      baseline.accept(saved.version, toMemberInfoValues(saved))
      queryClient.setQueryData(memberQueryKeys.detail(clubId, saved.membershipId), saved)
      // Chức danh và năm gia nhập hiện ở danh sách, bộ lọc.
      void queryClient.invalidateQueries({ queryKey: memberQueryKeys.all })
      toast.success(`Đã lưu thông tin của ${saved.person.fullName}.`)
      onDone()
    },
    onError: (error) => setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS)),
  })

  const conflict = isConflict(mutation.error)
  return {
    form,
    collectsStudentId: club.collectsStudentId,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    pending: mutation.isPending,
    conflict,
    reload: async () => {
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: memberQueryKeys.detail(clubId, member.membershipId),
          queryFn: () => memberRepository.get(clubId, member.membershipId),
          staleTime: 0,
        })
        const values = toMemberInfoValues(fresh)
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

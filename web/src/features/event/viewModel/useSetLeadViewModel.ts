import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { eventRepository } from '../model/eventRepository'
import type { StaffMember, Subcommittee } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

/** Người chọn được làm trưởng: nhân sự hiện có, không phải CTV (BR-ORG-01), trừ trưởng hiện tại. */
export function leadChoices(subcommittee: Pick<Subcommittee, 'members'>): StaffMember[] {
  return subcommittee.members.filter((member) => member.kind !== 'COLLABORATOR')
}

/** Lỗi theo ô trước khi gửi: phải chọn người, và đang có trưởng thì phải có lý do (trưởng cũ kết thúc chức kèm lý do). */
export function setLeadErrors(hasLead: boolean, userId: string, reason: string): { userId?: string; reason?: string } {
  const trimmed = reason.trim()
  return {
    ...(userId ? {} : { userId: 'Chọn người làm trưởng tiểu ban.' }),
    ...(hasLead && (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) ? { reason: `Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự.` } : {}),
  }
}

/** FR-EVT-08 (đổi trưởng tiểu ban): chọn trong nhân sự hiện có của tiểu ban, kể cả nhân sự CLB đồng tổ chức. */
export function useSetLeadViewModel(clubId: string, eventId: string) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<Subcommittee | null>(null)
  const [userId, setUserId] = useState('')
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const save = useMutation({
    mutationFn: (input: { subcommitteeId: string; userId: string; reason: string | null }) =>
      eventRepository.setSubcommitteeLead(clubId, eventId, input.subcommitteeId, { userId: input.userId, reason: input.reason }),
    meta: { silentError: true },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
      toast.success(`${updated.lead?.fullName ?? 'Người được chọn'} là trưởng tiểu ban ${updated.name}.`)
      setTarget(null)
    },
    onError: (error) => {
      // Nhân sự vừa đổi ở chỗ khác (bị gỡ, đã làm trưởng nơi khác): tải lại để danh sách chọn đúng.
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) void queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
    },
  })

  const hasLead = target?.lead !== null && target?.lead !== undefined
  const localErrors = touched ? setLeadErrors(hasLead, userId, reason) : {}
  const serverError = save.error instanceof ApiError ? save.error : null
  const serverField = (field: string) => serverError?.fieldErrors.find((fieldError) => fieldError.field === field)?.message

  return {
    target,
    hasLead,
    choices: target ? leadChoices(target) : [],
    open: (subcommittee: Subcommittee) => {
      save.reset()
      setUserId('')
      setReason('')
      setTouched(false)
      setTarget(subcommittee)
    },
    close: () => {
      if (!save.isPending) setTarget(null)
    },
    userId,
    setUserId,
    reason,
    setReason,
    userIdError: localErrors.userId ?? serverField('userId') ?? null,
    reasonError: localErrors.reason ?? serverField('reason') ?? null,
    formError: save.error && !(serverError && serverError.fieldErrors.length > 0) ? getErrorMessage(save.error) : null,
    submit: () => {
      setTouched(true)
      if (!target || Object.keys(setLeadErrors(hasLead, userId, reason)).length > 0) return
      save.mutate({ subcommitteeId: target.id, userId, reason: hasLead ? reason.trim() : null })
    },
    saving: save.isPending,
  }
}

export type SetLeadViewModel = ReturnType<typeof useSetLeadViewModel>

import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError, getErrorMessage } from '@/api/apiError'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { eventRepository } from '../model/eventRepository'
import type { Subcommittee } from '../model/eventTypes'
import { eventQueryKeys } from './eventQueryKeys'

export const subcommitteeSchema = z.object({
  name: z.string().trim().min(2, 'Tên tiểu ban cần ít nhất 2 ký tự.').max(80, 'Tên tối đa 80 ký tự.'),
  description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự.'),
  quota: z.string().trim().regex(/^$|^[1-9]\d{0,2}$/, 'Chỉ tiêu là số nguyên dương, để trống nếu không đặt.'),
  leadUserId: z.string(),
})
export type SubcommitteeValues = z.infer<typeof subcommitteeSchema>

const emptySubcommittee: SubcommitteeValues = { name: '', description: '', quota: '', leadUserId: '' }

/** FR-EVT-04 (lập tiểu ban, chỉ định trưởng) và FR-EVT-05 (mời thành viên, chỉ thấy tên và ban). */
export function useEventStaffViewModel(clubId: string, eventId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteTarget, setInviteTarget] = useState<Subcommittee | null>(null)
  const [candidateKeyword, setCandidateKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(candidateKeyword.trim(), 250)

  const subcommittees = useQuery({
    queryKey: eventQueryKeys.subcommittees(clubId, eventId),
    queryFn: () => eventRepository.subcommittees(clubId, eventId),
    enabled,
  })
  const candidates = useQuery({
    queryKey: eventQueryKeys.candidates(clubId, eventId, debouncedKeyword),
    queryFn: () => eventRepository.staffCandidates(clubId, eventId, debouncedKeyword),
    enabled: enabled && inviteTarget !== null,
    placeholderData: keepPreviousData,
  })
  // Ô chọn trưởng tiểu ban không có ô tìm, nên luôn lấy đủ danh sách, không dùng từ khóa của hộp thoại mời.
  const leadCandidates = useQuery({
    queryKey: eventQueryKeys.candidates(clubId, eventId, ''),
    queryFn: () => eventRepository.staffCandidates(clubId, eventId, ''),
    enabled: enabled && createOpen,
  })

  const form = useForm<SubcommitteeValues>({ resolver: zodResolver(subcommitteeSchema), defaultValues: emptySubcommittee })

  const create = useMutation({
    mutationFn: (values: SubcommitteeValues) =>
      eventRepository.createSubcommittee(clubId, eventId, {
        name: values.name,
        description: values.description,
        quota: values.quota ? Number(values.quota) : null,
        leadUserId: values.leadUserId || null,
      }),
    meta: { silentError: true },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
      toast.success(`Đã lập tiểu ban ${created.name}.`)
      form.reset(emptySubcommittee)
      setCreateOpen(false)
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      for (const fieldError of error.fieldErrors) {
        if (fieldError.field === 'name' || fieldError.field === 'quota' || fieldError.field === 'leadUserId') {
          form.setError(fieldError.field, { type: 'server', message: fieldError.message })
        }
      }
    },
  })

  const invite = useMutation({
    mutationFn: ({ subcommitteeId, userId }: { subcommitteeId: string; userId: string; fullName: string }) =>
      eventRepository.addStaff(clubId, eventId, subcommitteeId, userId),
    onSuccess: async (updated, input) => {
      await queryClient.invalidateQueries({ queryKey: eventQueryKeys.subcommittees(clubId, eventId) })
      setInviteTarget(updated)
      toast.success(`Đã thêm ${input.fullName} vào tiểu ban ${updated.name}.`)
    },
  })

  const createError = create.error
  return {
    subcommittees: subcommittees.data ?? [],
    loading: subcommittees.isPending && enabled,
    error: subcommittees.error,
    refetch: () => void subcommittees.refetch(),
    staffCount: (subcommittees.data ?? []).reduce((total, item) => total + item.members.length + (item.lead ? 1 : 0), 0),

    createOpen,
    openCreate: () => setCreateOpen(true),
    closeCreate: () => {
      if (create.isPending) return
      setCreateOpen(false)
      form.reset(emptySubcommittee)
      create.reset()
    },
    form,
    submitCreate: form.handleSubmit((values) => create.mutate(values)),
    leadCandidates: leadCandidates.data ?? [],
    leadCandidatesLoading: leadCandidates.isPending,
    leadCandidatesError: leadCandidates.error ? getErrorMessage(leadCandidates.error) : null,
    creating: create.isPending,
    createError: createError && !(createError instanceof ApiError && createError.fieldErrors.length > 0) ? getErrorMessage(createError) : null,

    inviteTarget,
    openInvite: (subcommittee: Subcommittee) => {
      setCandidateKeyword('')
      setInviteTarget(subcommittee)
    },
    closeInvite: () => setInviteTarget(null),
    candidateKeyword,
    setCandidateKeyword,
    candidates: candidates.data ?? [],
    candidatesLoading: candidates.isPending,
    candidatesError: candidates.error ? getErrorMessage(candidates.error) : null,
    invite: (userId: string, fullName: string) => {
      if (inviteTarget) invite.mutate({ subcommitteeId: inviteTarget.id, userId, fullName })
    },
    invitingUserId: invite.isPending ? (invite.variables?.userId ?? null) : null,
    isInTarget: (userId: string) =>
      inviteTarget !== null && (inviteTarget.lead?.id === userId || inviteTarget.members.some((member) => member.id === userId)),
  }
}

export type EventStaffViewModel = ReturnType<typeof useEventStaffViewModel>

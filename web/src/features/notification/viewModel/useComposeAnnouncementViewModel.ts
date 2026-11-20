import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, getErrorMessage, isForbidden } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { clubQueryKeys } from '@/features/club/viewModel/useClubDetail'
import { applyServerFieldErrors } from '@/shared/form/applyServerFieldErrors'
import { notificationRepository } from '../model/notificationRepository'
import type { SendAnnouncementRequest } from '../model/notificationTypes'
import { announcementSchema, audienceKey, findAudience, toSendAnnouncementRequest, type AnnouncementValues } from './announcementSchema'
import { notificationQueryKeys } from './notificationQueryKeys'

const SERVER_FIELDS = ['audience', 'title', 'body'] as const

/** FR-NOT-01: gửi thông báo cho một nhóm thuộc phạm vi chức vụ ở CLB hiện hành; chỉ báo thành công khi máy chủ xác nhận. */
export function useComposeAnnouncementViewModel(onDone: () => void) {
  const queryClient = useQueryClient()
  const { clubId, club } = useCurrentClub()
  const audiences = useQuery({ queryKey: notificationQueryKeys.audiences(clubId), queryFn: () => notificationRepository.audiences(clubId), staleTime: 0 })
  const options = audiences.data ?? []
  const selectable = options.filter((audience) => audience.recipientCount > 0)
  const form = useForm<AnnouncementValues>({ resolver: zodResolver(announcementSchema), defaultValues: { audience: '', title: '', body: '', sendEmail: false } })
  const chosenKey = useWatch({ control: form.control, name: 'audience' })
  const [fieldErrorsApplied, setFieldErrorsApplied] = useState(false)

  // Chỉ có một nhóm gửi được thì chọn sẵn; nhiều nhóm thì người gửi tự chọn để không gửi nhầm cả CLB.
  const onlyKey = selectable.length === 1 && selectable[0] ? audienceKey(selectable[0]) : null
  const chosenGone = audiences.isSuccess && chosenKey !== '' && findAudience(selectable, chosenKey) === null
  useEffect(() => {
    if (chosenKey === '' && onlyKey) form.setValue('audience', onlyKey)
    // Danh sách tải lại mà nhóm đang chọn không còn thì bỏ chọn, để ô chọn không hiện một nhóm khác với giá trị sẽ gửi.
    else if (chosenGone) form.setValue('audience', onlyKey ?? '')
  }, [chosenKey, chosenGone, onlyKey, form])

  const mutation = useMutation({
    mutationFn: (request: SendAnnouncementRequest) => notificationRepository.sendAnnouncement(clubId, request),
    meta: { silentError: true },
    onMutate: () => setFieldErrorsApplied(false),
    onSuccess: (result) => {
      toast.success(`Đã gửi thông báo tới ${result.recipientCount} người.`)
      onDone()
    },
    onError: (error) => {
      setFieldErrorsApplied(applyServerFieldErrors(error, form.setError, SERVER_FIELDS))
      // Phạm vi chức vụ hoặc người trong nhóm đã đổi thì tải lại để lựa chọn, số người nhận và nút khớp với máy chủ.
      if (isForbidden(error) || (error instanceof ApiError && error.status === 422)) void audiences.refetch()
      if (isForbidden(error)) void queryClient.invalidateQueries({ queryKey: clubQueryKeys.detail(clubId) })
    },
  })

  return {
    clubName: club.name,
    form,
    audiences: options,
    /** Không còn nhóm nào gửi được, ví dụ vừa mất chức vụ hoặc nhóm chưa có ai ngoài người gửi. */
    nothingToSend: audiences.isSuccess && selectable.length === 0,
    /** Chỉ gửi khi đã có danh sách nhóm nhận và còn nhóm gửi được. */
    canSubmit: audiences.isSuccess && selectable.length > 0,
    audiencesLoading: audiences.isPending,
    audiencesError: audiences.error,
    retryAudiences: () => void audiences.refetch(),
    selected: findAudience(options, chosenKey),
    submit: form.handleSubmit((values) => {
      const request = toSendAnnouncementRequest(values, selectable)
      if (!request) {
        form.setError('audience', { type: 'validate', message: 'Nhóm nhận không còn trong danh sách. Chọn lại.' })
        return
      }
      mutation.mutate(request)
    }),
    pending: mutation.isPending,
    errorMessage: mutation.error && !fieldErrorsApplied ? getErrorMessage(mutation.error) : null,
  }
}

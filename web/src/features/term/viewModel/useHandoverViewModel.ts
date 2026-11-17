import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { termRepository } from '../model/termRepository'
import { groupAppointments } from './termDisplay'
import { termQueryKeys } from './termQueryKeys'

/** Trang phiên bàn giao (FR-TERM-03..06): hai nhiệm kỳ, kết quả bầu, số mục bàn giao, điều kiện còn thiếu và hoàn tất. */
export function useHandoverViewModel() {
  const { clubId, club } = useCurrentClub()
  const handoverId = useParams().handoverId ?? ''
  // Số đếm danh mục phải khớp danh sách mục (luôn tải mới), nên phiên cũng tải mới mỗi lần mở trang.
  const query = useQuery({ queryKey: termQueryKeys.handover(clubId, handoverId), queryFn: () => termRepository.handover(clubId, handoverId), staleTime: 0 })
  const [appointmentsOpen, setAppointmentsOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const handover = query.data ?? null

  return {
    clubId,
    clubName: club.name,
    handover,
    loading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
    groups: groupAppointments(handover?.appointments ?? []),
    canEditAppointments: handover?.allowedActions.includes('EDIT_APPOINTMENTS') ?? false,
    appointmentsOpen: appointmentsOpen && handover !== null,
    openAppointments: () => setAppointmentsOpen(true),
    closeAppointments: () => setAppointmentsOpen(false),
    canComplete: handover?.allowedActions.includes('COMPLETE') ?? false,
    completeOpen: completeOpen && handover !== null,
    /** Tải lại phiên khi mở hộp, để tóm tắt và version là bản mới nhất. */
    openComplete: () => {
      void query.refetch()
      setCompleteOpen(true)
    },
    closeComplete: () => setCompleteOpen(false),
  }
}

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getErrorMessage } from '@/api/apiError'
import { useCurrentClub } from '@/features/club/viewModel/clubContext'
import { eventRepository } from '@/features/event/model/eventRepository'
import { selectableLead } from '@/features/event/viewModel/eventDisplay'
import { eventQueryKeys } from '@/features/event/viewModel/eventQueryKeys'
import type { EventLeadAction, EventLeadDecisionRequest, HandoverItem } from '../model/handoverTypes'

/** FR-TERM-05: giữ Trưởng BTC đang hiệu lực, hoặc chọn người thay trong số thành viên Thử việc, Chính thức (BR-ORG-01). */
export function useEventLeadDecisionViewModel(item: HandoverItem) {
  const { clubId } = useCurrentClub()
  const candidates = useQuery({ queryKey: eventQueryKeys.leadCandidates(clubId), queryFn: () => eventRepository.leadCandidates(clubId) })
  const lead = item.event?.lead ?? null
  const previous = item.eventLead
  const [action, setAction] = useState<EventLeadAction>(lead !== null && previous?.action !== 'REPLACE' ? 'KEEP' : 'REPLACE')
  const [userId, setUserId] = useState(previous?.action === 'REPLACE' ? previous.person.id : '')
  const options = (candidates.data ?? []).filter((candidate) => candidate.id !== lead?.id)
  const selected = selectableLead(options, userId)

  return {
    lead,
    canKeep: lead !== null,
    action,
    setAction,
    options,
    selected,
    setUserId,
    candidatesLoading: candidates.isPending,
    candidatesError: candidates.error ? getErrorMessage(candidates.error) : null,
    /** Người đã chọn lần trước không còn trong danh sách ứng viên thì phải chọn lại. */
    previousGone: previous?.action === 'REPLACE' && !candidates.isPending && selected === '',
    canSubmit: action === 'KEEP' ? lead !== null : selected !== '',
    request: (): EventLeadDecisionRequest => (action === 'KEEP' ? { action: 'KEEP' } : { action: 'REPLACE', userId: selected }),
  }
}

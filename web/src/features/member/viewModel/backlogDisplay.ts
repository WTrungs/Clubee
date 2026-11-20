import type { PersonRef } from '@/api/commonTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import type { Tone } from '@/shared/ui/tone'
import type { BacklogAction, BacklogItem, BacklogKind, BacklogStatus } from '../model/backlogTypes'

export const BACKLOG_KINDS: BacklogKind[] = ['POSITION', 'TASK', 'TASK_REVIEW']

export const backlogKindDisplay: Record<BacklogKind, { label: string; tone: Tone }> = {
  POSITION: { label: 'Chức vụ', tone: 'info' },
  TASK: { label: 'Việc đang làm', tone: 'neutral' },
  TASK_REVIEW: { label: 'Việc chờ nghiệm thu', tone: 'neutral' },
}

export const backlogStatusDisplay: Record<BacklogStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Chưa xử lý', tone: 'warning' },
  RESOLVED: { label: 'Đã xử lý', tone: 'success' },
}

/** Nhãn nút theo loại mục: việc chờ nghiệm thu thì đổi người nghiệm thu, không phải giao lại việc. */
export function backlogActionLabel(action: BacklogAction, kind: BacklogKind): string {
  if (action === 'REASSIGN') return kind === 'TASK_REVIEW' ? 'Đổi người nghiệm thu' : 'Giao lại'
  return action === 'APPOINT' ? 'Chỉ định người thay' : 'Không cần thay'
}

/** Mô tả trong sheet chọn người. */
export function resolveSheetText(item: Pick<BacklogItem, 'kind' | 'title' | 'formerMember'>, action: Exclude<BacklogAction, 'DISMISS'>): { title: string; description: string; submitLabel: string } {
  if (action === 'APPOINT') {
    return {
      title: 'Chỉ định người thay',
      description: `${item.title}, thay ${item.formerMember.fullName}. Người được chọn nhận chức từ hôm nay.`,
      submitLabel: 'Chỉ định',
    }
  }
  if (item.kind === 'TASK_REVIEW') {
    return {
      title: 'Đổi người nghiệm thu',
      description: `Việc ${item.title} cần người nghiệm thu thay ${item.formerMember.fullName}. Chỉ người quản lý phạm vi của việc được chọn.`,
      submitLabel: 'Đổi người nghiệm thu',
    }
  }
  return { title: 'Giao lại việc', description: `Việc ${item.title} đang do ${item.formerMember.fullName} làm. Người nhận phải thuộc phạm vi của việc.`, submitLabel: 'Giao lại' }
}

/** Ví dụ "Đã giao lại cho Hoàng Thảo Vy · Nguyễn Minh Anh, 14/11/2026 21:00"; mục tự xong thì nêu lý do. */
export function backlogOutcome(item: Pick<BacklogItem, 'kind' | 'resolution' | 'resolvedNote'>): string | null {
  const resolution = item.resolution
  if (!resolution) return item.resolvedNote
  const by = `${resolution.by.fullName}, ${formatDateTime(resolution.at)}`
  const person = resolution.person?.fullName ?? ''
  if (resolution.action === 'DISMISS') return `Không cần thay: ${resolution.reason ?? ''} · ${by}`
  if (resolution.action === 'APPOINT') return `Đã chỉ định ${person} · ${by}`
  return item.kind === 'TASK_REVIEW' ? `${person} nghiệm thu thay · ${by}` : `Đã giao lại cho ${person} · ${by}`
}

export interface BacklogGroup {
  person: PersonRef
  items: BacklogItem[]
}

/** Nhóm theo người cũ, giữ thứ tự máy chủ trả về. */
export function groupByFormerMember(items: BacklogItem[]): BacklogGroup[] {
  const groups = new Map<string, BacklogGroup>()
  for (const item of items) {
    const group = groups.get(item.formerMember.id) ?? { person: item.formerMember, items: [] }
    group.items.push(item)
    groups.set(item.formerMember.id, group)
  }
  return [...groups.values()]
}

export function resolvedToast(item: Pick<BacklogItem, 'kind'>, action: BacklogAction, personName: string): string {
  if (action === 'DISMISS') return 'Đã ghi nhận chức vụ không cần người thay.'
  if (action === 'APPOINT') return `Đã chỉ định ${personName}.`
  return item.kind === 'TASK_REVIEW' ? `Đã đổi người nghiệm thu thành ${personName}.` : `Đã giao lại việc cho ${personName}.`
}

export const parseBacklogStatus = (value: string | null): BacklogStatus => (value === 'RESOLVED' ? 'RESOLVED' : 'OPEN')
export const parseBacklogKind = (value: string | null): BacklogKind | '' => BACKLOG_KINDS.find((kind) => kind === value) ?? ''

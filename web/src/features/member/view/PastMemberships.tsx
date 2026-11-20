import { formatDate } from '@/shared/format/formatDate'
import type { PastMembership } from '../model/memberTypes'
import { exitKindLabel } from '../viewModel/memberDisplay'

/** Lịch sử cũ và lý do rời của người từng là thành viên (FR-MEM-03). */
export function PastMemberships({ items }: { items: PastMembership[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.membershipId} className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">
            {item.joinedOn ? formatDate(item.joinedOn) : 'Chưa gia nhập'} – {item.leftOn ? formatDate(item.leftOn) : '—'}
            {item.departmentName && <span className="font-normal text-muted-foreground"> · Ban {item.departmentName}</span>}
          </p>
          <p className="text-muted-foreground">
            {item.exitKind ? exitKindLabel[item.exitKind] : 'Đã rời'}
            {item.reason && `: ${item.reason}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

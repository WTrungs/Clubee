import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { formatDate } from '@/shared/format/formatDate'
import { itemVariants, listVariants } from '@/shared/motion/presets'
import { Avatar } from '@/shared/ui/Avatar'
import { Badge } from '@/shared/ui/Badge'
import type { MemberSummary } from '../model/memberTypes'
import { memberStatusDisplay } from '../viewModel/memberDisplay'

interface MemberTableProps {
  members: MemberSummary[]
  listKey: string
  onOpen: (member: MemberSummary) => void
}

export function MemberStatusBadge({ status }: { status: MemberSummary['status'] }) {
  const display = memberStatusDisplay[status]
  return (
    <Badge tone={display.tone} dot>
      {display.label}
    </Badge>
  )
}

function PositionChips({ titles }: { titles: string[] }) {
  if (titles.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {titles.map((title) => (
        <span key={title} className="rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-on-primary-soft">
          {title}
        </span>
      ))}
    </span>
  )
}

/** Danh sách thành viên: bảng ở màn rộng, thẻ ở màn hẹp. Cột liên hệ, MSSV chỉ có khi máy chủ trả về (SRS 3.5). */
export function MemberTable({ members, listKey, onOpen }: MemberTableProps) {
  const wide = useMediaQuery('(min-width: 1024px)')
  const showContact = members.some((member) => member.contact !== null)

  if (wide) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Thành viên
              </th>
              <th scope="col" className="px-4 py-3">
                Ban
              </th>
              <th scope="col" className="px-4 py-3">
                Chức vụ
              </th>
              <th scope="col" className="px-4 py-3">
                Trạng thái
              </th>
              <th scope="col" className="px-4 py-3">
                Gia nhập
              </th>
              {showContact && (
                <th scope="col" className="px-4 py-3">
                  Liên hệ
                </th>
              )}
            </tr>
          </thead>
          <motion.tbody variants={listVariants} initial="initial" animate="animate" key={listKey}>
            {members.map((member) => (
              <motion.tr key={member.membershipId} variants={itemVariants} className="border-t transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(member)} className="flex cursor-pointer items-center gap-3 text-left">
                    <Avatar name={member.person.fullName} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold hover:text-primary">{member.person.fullName}</span>
                      {member.displayTitle && <span className="block text-xs text-muted-foreground">{member.displayTitle}</span>}
                      {member.studentId && <span className="block text-xs text-muted-foreground">MSSV {member.studentId}</span>}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3">{member.department?.name ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">
                  <PositionChips titles={member.positionTitles} />
                </td>
                <td className="px-4 py-3">
                  <MemberStatusBadge status={member.status} />
                </td>
                <td className="px-4 py-3 tabular-nums">{member.joinedOn ? formatDate(member.joinedOn) : '—'}</td>
                {showContact && (
                  <td className="px-4 py-3">
                    {member.contact && (
                      <span className="block text-xs">
                        <span className="block">{member.contact.email}</span>
                        <span className="block text-muted-foreground">{member.contact.phone ?? '—'}</span>
                      </span>
                    )}
                  </td>
                )}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    )
  }

  return (
    <motion.ul variants={listVariants} initial="initial" animate="animate" key={listKey} className="grid grid-cols-1 gap-2.5">
      {members.map((member) => (
        <motion.li key={member.membershipId} variants={itemVariants}>
          <button
            type="button"
            onClick={() => onOpen(member)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/40"
          >
            <Avatar name={member.person.fullName} size="md" />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-semibold">{member.person.fullName}</span>
                <MemberStatusBadge status={member.status} />
              </span>
              {member.displayTitle && <span className="block truncate text-xs font-medium">{member.displayTitle}</span>}
              <span className="block truncate text-xs text-muted-foreground">
                {member.department ? `Ban ${member.department.name}` : 'Chưa có ban'}
                {member.positionTitles.length > 0 && ` · ${member.positionTitles.join(', ')}`}
              </span>
              {member.contact && <span className="block truncate text-xs text-muted-foreground">{member.contact.email}</span>}
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </motion.li>
      ))}
    </motion.ul>
  )
}

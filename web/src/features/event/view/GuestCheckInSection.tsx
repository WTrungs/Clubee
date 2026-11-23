import { CheckCircle2, UserRoundSearch } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { SearchInput } from '@/shared/ui/ListControls'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import { registrationStatusDisplay } from '../viewModel/eventDisplay'
import { useGuestCheckInViewModel } from '../viewModel/useGuestViewModels'

interface GuestCheckInSectionProps {
  clubId: string
  eventId: string
  day: string | null
  canMark: boolean
}

/** FR-ATT-07: khách mời được BTC tra theo mã trong email, email hoặc SĐT, rồi ghi có mặt cho ngày đang chọn. */
export function GuestCheckInSection({ clubId, eventId, day, canMark }: GuestCheckInSectionProps) {
  const vm = useGuestCheckInViewModel(clubId, eventId, day)
  return (
    <section aria-labelledby="guest-check-in" className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h3 id="guest-check-in" className="font-bold">
          Khách mời
        </h3>
        <p className="text-sm text-muted-foreground">Tra theo mã tham dự, email hoặc số điện thoại đầy đủ; liên hệ của khách được che bớt.</p>
      </div>
      <SearchInput label="Tra khách mời" placeholder="Mã tham dự, email, SĐT…" value={vm.keyword} onValueChange={vm.setKeyword} className="sm:max-w-sm" />
      {vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.retry} />
      ) : vm.loading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : vm.rows.length === 0 ? (
        <EmptyState icon={UserRoundSearch} title={vm.keyword ? 'Không tìm thấy khách mời' : 'Chưa có khách mời đăng ký'} />
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Danh sách khách mời">
          {vm.rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.fullName}</p>
                <p className="text-xs break-all text-muted-foreground">
                  Mã {row.code}
                  {(row.emailHint ?? row.phoneHint) && ` · ${row.emailHint ?? row.phoneHint}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={registrationStatusDisplay[row.status].tone}>{registrationStatusDisplay[row.status].label}</Badge>
                {row.checkedIn ? (
                  <Badge tone="success" title={row.checkedInAt ? `Ghi lúc ${formatDateTime(row.checkedInAt)}` : undefined}>
                    <CheckCircle2 aria-hidden className="size-3.5" />
                    Có mặt
                  </Badge>
                ) : (
                  canMark && (
                    <Button size="sm" onClick={() => vm.checkIn(row)} loading={vm.checkingId === row.id} aria-label={`Ghi có mặt: ${row.fullName}`}>
                      Ghi có mặt
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

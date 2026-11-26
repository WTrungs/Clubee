import { QRCodeSVG } from 'qrcode.react'
import { Badge } from '@/shared/ui/Badge'
import type { GuestPass } from '../model/eventTypes'
import { guestPassStatusText } from '../viewModel/useGuestViewModels'

/** Mã tham dự dạng QR kèm mã chữ để BTC gõ tra khi không quét được (FR-EVT-12, FR-ATT-07). */
export function GuestTicket({ pass }: { pass: GuestPass }) {
  const tone = pass.status === 'CANCELLED' ? 'neutral' : pass.status === 'WAITLISTED' ? 'warning' : 'success'
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center shadow-sm">
      <Badge tone={tone} dot>
        {guestPassStatusText(pass)}
      </Badge>
      <div className={pass.status === 'CANCELLED' ? 'opacity-30' : undefined}>
        <QRCodeSVG value={pass.code} size={176} level="M" marginSize={2} fgColor="currentColor" bgColor="transparent" role="img" aria-label={`Mã QR tham dự ${pass.code}`} />
      </div>
      <p className="text-sm text-muted-foreground">Mã tham dự</p>
      <p className="font-mono text-2xl font-bold tracking-[0.2em]">{pass.code}</p>
      <p className="text-sm">
        <span className="font-semibold">{pass.fullName}</span>
        {(pass.emailHint ?? pass.phoneHint) && <span className="text-muted-foreground"> · {pass.emailHint ?? pass.phoneHint}</span>}
      </p>
    </div>
  )
}

import { ScrollText } from 'lucide-react'
import type { ClubDetail } from '../model/clubTypes'
import { ClubContactList } from './ClubContactList'

/** Liên hệ công khai và nội quy (FR-CLB-02). Nội quy là văn bản thuần, hiện giữ nguyên xuống dòng, không render HTML. */
export function ClubAboutPanel({ club }: { club: ClubDetail }) {
  return (
    <section className="grid grid-cols-1 gap-5 rounded-2xl border bg-card p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-3">
        <h2 className="font-bold">Liên hệ công khai</h2>
        <ClubContactList contacts={club} emptyText="CLB chưa công bố thông tin liên hệ." />
      </div>
      <div className="min-w-0 space-y-3">
        <h2 className="flex items-center gap-2 font-bold">
          <ScrollText aria-hidden className="size-5 text-muted-foreground" />
          Nội quy
        </h2>
        {club.rules ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-line">{club.rules}</p>
        ) : (
          <p className="text-sm text-muted-foreground">CLB chưa có nội quy.</p>
        )}
      </div>
    </section>
  )
}

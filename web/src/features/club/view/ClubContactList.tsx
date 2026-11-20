import { ExternalLink, Mail, Phone } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { safeHttpUrl } from '@/shared/lib/contactRules'
import type { ClubContacts } from '../model/clubTypes'

/** Liên hệ công khai của CLB (SRS 3.5); không có liên hệ nào thì hiện `emptyText` hoặc không hiện gì. */
export function ClubContactList({ contacts, emptyText, className }: { contacts: ClubContacts; emptyText?: string; className?: string }) {
  const url = safeHttpUrl(contacts.contactUrl)
  if (!contacts.contactEmail && !contacts.contactPhone && !url) {
    return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null
  }
  return (
    <ul aria-label="Liên hệ công khai" className={cn('min-w-0 space-y-2 text-sm', className)}>
      {contacts.contactEmail && (
        <li className="flex min-w-0 items-center gap-2">
          <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <a href={`mailto:${contacts.contactEmail}`} className="truncate font-semibold text-primary hover:underline">
            {contacts.contactEmail}
          </a>
        </li>
      )}
      {contacts.contactPhone && (
        <li className="flex items-center gap-2">
          <Phone aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <a href={`tel:${contacts.contactPhone}`} className="font-semibold text-primary hover:underline">
            {contacts.contactPhone}
          </a>
        </li>
      )}
      {url && (
        <li className="flex min-w-0 items-center gap-2">
          <ExternalLink aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <a href={url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-primary hover:underline">
            {url}
          </a>
        </li>
      )}
    </ul>
  )
}

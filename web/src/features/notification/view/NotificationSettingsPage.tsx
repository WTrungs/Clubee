import { BellRing } from 'lucide-react'
import { formatDateTime } from '@/shared/format/formatDate'
import { Button } from '@/shared/ui/Button'
import { ConflictBanner } from '@/shared/ui/ConflictBanner'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import { Switch } from '@/shared/ui/Switch'
import { NOTIFICATION_CATEGORIES, notificationCategoryDisplay } from '../viewModel/notificationDisplay'
import { useNotificationSettingsViewModel, type Channel } from '../viewModel/useNotificationSettingsViewModel'

const CHANNELS: Array<{ key: Channel; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'Push' },
]

/** FR-ACC-07: bật, tắt email và push theo loại thông báo; thông báo trong hệ thống luôn bật. */
export function NotificationSettingsPage() {
  const vm = useNotificationSettingsViewModel()
  return (
    <div>
      <PageHeader eyebrow="Tài khoản" title="Tùy chọn thông báo" description="Chọn loại thông báo nào gửi thêm qua email và push. Push gửi tới ứng dụng Clubee trên Android." />
      {vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.retry} />
      ) : vm.loading || !vm.values ? (
        <Skeleton role="status" aria-label="Đang tải tùy chọn thông báo" className="h-96 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          <ConflictBanner show={vm.conflict} onReload={() => void vm.reload()} message="Tùy chọn vừa được lưu ở nơi khác. Tải lại để xem bản mới nhất rồi chỉnh lại." />
          <p className="flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm text-on-primary-soft">
            <BellRing aria-hidden className="mt-0.5 size-4 shrink-0" />
            Thông báo trong hệ thống luôn bật cho mọi loại, kể cả khi bạn tắt email và push.
          </p>
          <section aria-label="Kênh gửi theo loại thông báo" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(2,3.75rem)] items-center gap-2 border-b bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_repeat(2,6rem)]">
              <span>Loại thông báo</span>
              {CHANNELS.map((channel) => (
                <span key={channel.key} className="text-center">
                  {channel.label}
                </span>
              ))}
            </div>
            <ul className="divide-y">
              {NOTIFICATION_CATEGORIES.map((category) => {
                const label = notificationCategoryDisplay[category].label
                return (
                  <li key={category} className="grid grid-cols-[minmax(0,1fr)_repeat(2,3.75rem)] items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(2,6rem)]">
                    <span className="min-w-0 text-sm font-semibold">{label}</span>
                    {CHANNELS.map((channel) => (
                      <span key={channel.key} className="flex justify-center">
                        <Switch
                          aria-label={`${channel.label}: ${label}`}
                          checked={vm.values?.[category][channel.key] ?? true}
                          disabled={vm.saving || vm.conflict}
                          onCheckedChange={(checked) => vm.toggle(category, channel.key, checked)}
                        />
                      </span>
                    ))}
                  </li>
                )
              })}
            </ul>
          </section>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {vm.updatedAt && vm.changes === 0 && <p className="text-xs text-muted-foreground sm:mr-auto">Lưu lần cuối {formatDateTime(vm.updatedAt)}.</p>}
            {vm.changes > 0 && (
              <>
                <p role="status" className="text-sm text-muted-foreground sm:mr-auto">
                  {vm.changes} thay đổi chưa lưu.
                </p>
                <Button variant="ghost" onClick={vm.discard} disabled={vm.saving}>
                  Hoàn tác
                </Button>
              </>
            )}
            <Button onClick={vm.save} loading={vm.saving} disabled={vm.changes === 0 || vm.conflict}>
              Lưu tùy chọn
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

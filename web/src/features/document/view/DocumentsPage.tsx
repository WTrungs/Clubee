import { ArchiveRestore, Download, EyeOff, FilePlus2, FileText, FilterX, History, Upload } from 'lucide-react'
import { formatDate, formatDateTime } from '@/shared/format/formatDate'
import { formatFileSize } from '@/shared/lib/validateUploadFile'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { NativeSelect } from '@/shared/ui/Input'
import { FilterChip, Pagination, SearchInput } from '@/shared/ui/ListControls'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ReasonDialog } from '@/shared/ui/ReasonDialog'
import { Sheet, SheetContent } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { EmptyState, ErrorState } from '@/shared/ui/StateViews'
import type { DocumentDetail, DocumentSummary } from '../model/documentTypes'
import { visibilityOptions } from '../viewModel/documentFormSchema'
import { useDocumentsViewModel, type DocumentsViewModel } from '../viewModel/useDocumentsViewModel'
import { UploadDocumentSheet } from './UploadDocumentSheet'
import { UploadVersionDialog } from './UploadVersionDialog'

const visibilityLabel = (value: DocumentSummary['visibility']) => visibilityOptions.find((option) => option.value === value)?.label ?? value

function DownloadButton({ vm, document, compact = false }: { vm: DocumentsViewModel; document: DocumentSummary; compact?: boolean }) {
  return (
    <Button
      variant="outline"
      size={compact ? 'iconSm' : 'sm'}
      loading={vm.downloadingId === document.id}
      disabled={vm.downloadingId !== null}
      onClick={() => vm.download(document.id)}
      aria-label={`Tải xuống ${document.title}`}
    >
      <Download aria-hidden />
      {!compact && 'Tải xuống'}
    </Button>
  )
}

/** FR-DOC-04: người ẩn, lúc ẩn và lý do; chỉ ban chủ nhiệm thấy tài liệu đã ẩn. */
function HiddenNote({ document }: { document: DocumentSummary }) {
  if (!document.hidden) return null
  return (
    <p className="mt-1 text-xs text-status-warning [overflow-wrap:anywhere]">
      Đã ẩn bởi {document.hidden.by.fullName}, {formatDateTime(document.hidden.at)}: {document.hidden.reason}
    </p>
  )
}

function RestoreButton({ vm, document }: { vm: DocumentsViewModel; document: DocumentSummary }) {
  if (!document.allowedActions.includes('RESTORE')) return null
  return (
    <Button variant="outline" size="sm" onClick={() => vm.setRestoreTarget(document)} aria-label={`Khôi phục ${document.title}`}>
      <ArchiveRestore aria-hidden />
      Khôi phục
    </Button>
  )
}

/** FR-DOC-03: mọi phiên bản, mới nhất trước; bản nào cũng tải lại được. */
function VersionHistory({ vm, document }: { vm: DocumentsViewModel; document: DocumentDetail }) {
  return (
    <section aria-labelledby="document-versions" className="space-y-2 border-t pt-4">
      <h3 id="document-versions" className="flex items-center gap-2 text-sm font-bold">
        <History aria-hidden className="size-4 text-muted-foreground" />
        Phiên bản ({document.versions.length})
      </h3>
      <ol aria-label="Các phiên bản" className="space-y-2">
        {document.versions.map((version) => (
          <li key={version.number} className="flex min-w-0 items-start gap-3 rounded-xl bg-muted/60 p-3 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                Bản {version.number}
                {version.current && <Badge tone="success">Hiện hành</Badge>}
              </p>
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {version.fileName} · {formatFileSize(version.fileSize)}
              </p>
              {version.note && <p className="[overflow-wrap:anywhere]">{version.note}</p>}
              <p className="text-xs text-muted-foreground">
                {version.uploadedBy.fullName} · {formatDateTime(version.uploadedAt)}
              </p>
            </div>
            <Button
              variant="outline"
              size="iconSm"
              loading={vm.downloadingId === document.id && vm.downloadingVersion === version.number}
              disabled={vm.downloadingId !== null}
              onClick={() => vm.download(document.id, version.number)}
              aria-label={`Tải xuống bản ${version.number} của ${document.title}`}
            >
              <Download aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
    </section>
  )
}

function DocumentDetailSheet({ vm }: { vm: DocumentsViewModel }) {
  const document = vm.detail
  return (
    <Sheet open={vm.detailId !== null} onOpenChange={(open) => !open && vm.closeDetail()}>
      <SheetContent title={document?.title ?? 'Tài liệu'} description={document ? `${document.fileName} · ${formatFileSize(document.fileSize)}` : undefined}>
        <div className="space-y-5 p-5">
          {vm.detailLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
          {vm.detailError && <ErrorState error={vm.detailError} />}
          {document && (
            <>
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Nơi sở hữu</dt>
                  <dd>{document.owner.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Nhiệm kỳ</dt>
                  <dd>{document.term?.name ?? 'Không gắn nhiệm kỳ'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Ai được xem</dt>
                  <dd>{visibilityLabel(document.visibility)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Tải lên</dt>
                  <dd>
                    {document.uploadedBy.fullName} · {formatDateTime(document.uploadedAt)}
                  </dd>
                </div>
              </dl>
              {document.tags.length > 0 && (
                <p className="flex flex-wrap gap-1.5">
                  {document.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </p>
              )}
              {document.description && <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{document.description}</p>}
              {document.hidden && (
                <p role="status" className="rounded-xl bg-status-warning-soft p-3 text-sm text-status-warning [overflow-wrap:anywhere]">
                  Tài liệu đang ẩn với mọi người trừ ban chủ nhiệm. Ẩn bởi {document.hidden.by.fullName}, {formatDateTime(document.hidden.at)}: {document.hidden.reason}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <DownloadButton vm={vm} document={document} />
                {document.allowedActions.includes('UPLOAD_VERSION') && (
                  <Button variant="outline" size="sm" onClick={() => vm.setVersionOpen(true)}>
                    <FilePlus2 aria-hidden />
                    Tải phiên bản mới
                  </Button>
                )}
                {document.allowedActions.includes('HIDE') && (
                  <Button variant="outline" size="sm" onClick={() => vm.setHideTarget(document)}>
                    <EyeOff aria-hidden />
                    Ẩn tài liệu
                  </Button>
                )}
                <RestoreButton vm={vm} document={document} />
              </div>
              <VersionHistory vm={vm} document={document} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** FR-DOC-01..04: tài liệu của CLB; bảng ở màn rộng, thẻ ở màn hẹp; ban chủ nhiệm xem và khôi phục tài liệu đã ẩn. */
export function DocumentsPage() {
  const vm = useDocumentsViewModel()

  return (
    <div>
      <PageHeader
        title="Tài liệu"
        description="Tài liệu của CLB, các ban và sự kiện mà bạn được xem."
        actions={
          vm.canUpload && (
            <Button onClick={() => vm.setUploadOpen(true)}>
              <Upload aria-hidden />
              Tải lên
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
        <SearchInput label="Tìm tài liệu" placeholder="Tìm theo tên, tệp, nhãn…" value={vm.keyword} onValueChange={vm.setKeyword} />
        <NativeSelect aria-label="Lọc theo nhiệm kỳ" value={vm.termId} onChange={(event) => vm.setTermId(event.target.value)}>
          <option value="">Mọi nhiệm kỳ</option>
          {vm.facets.terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo nhãn" value={vm.tag} onChange={(event) => vm.setTag(event.target.value)}>
          <option value="">Mọi nhãn</option>
          {vm.facets.tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo nơi sở hữu" value={vm.owner} onChange={(event) => vm.setOwner(event.target.value)}>
          <option value="">Mọi nơi sở hữu</option>
          {vm.facets.owners.map((owner) => (
            <option key={`${owner.type}:${owner.id ?? ''}`} value={owner.type === 'CLUB' ? 'CLUB' : `${owner.type}:${owner.id ?? ''}`}>
              {owner.name}
            </option>
          ))}
        </NativeSelect>
        {vm.filtered && (
          <Button variant="ghost" onClick={vm.clearFilters}>
            <FilterX aria-hidden />
            Bỏ lọc
          </Button>
        )}
      </div>

      {vm.canViewHidden && (
        <div className="mb-4">
          <FilterChip label="Tài liệu đã ẩn" selected={vm.showHidden} onToggle={() => vm.setShowHidden(!vm.showHidden)} />
        </div>
      )}

      {vm.loading ? (
        <div role="status" aria-label="Đang tải tài liệu">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.refetch} />
      ) : vm.rows.length === 0 ? (
        <EmptyState
          icon={vm.showHidden ? EyeOff : FileText}
          title={vm.filtered ? 'Không có tài liệu phù hợp' : vm.showHidden ? 'Không có tài liệu nào đang ẩn' : 'Chưa có tài liệu nào'}
          description={vm.filtered ? 'Thử từ khóa hoặc bộ lọc khác.' : !vm.showHidden && vm.canUpload ? 'Bấm Tải lên để thêm tài liệu đầu tiên.' : undefined}
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Tài liệu</th>
                  <th className="px-4 py-2.5 font-semibold">Nơi sở hữu</th>
                  <th className="px-4 py-2.5 font-semibold">Nhiệm kỳ</th>
                  <th className="px-4 py-2.5 font-semibold">Tải lên</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vm.rows.map((document) => (
                  <tr key={document.id} className="align-top">
                    <td className="max-w-0 px-4 py-3 lg:w-2/5">
                      <button type="button" onClick={() => vm.openDetail(document.id)} className="text-left font-semibold [overflow-wrap:anywhere] hover:text-primary">
                        {document.title}
                      </button>
                      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {document.fileName} · {formatFileSize(document.fileSize)}
                        {document.currentVersion > 1 && ` · Bản ${document.currentVersion}`}
                      </span>
                      <HiddenNote document={document} />
                      {document.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {document.tags.map((tag) => (
                            <Badge key={tag} tone="neutral">
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{document.owner.name}</td>
                    <td className="px-4 py-3">{document.term?.name ?? '–'}</td>
                    <td className="px-4 py-3">
                      {document.uploadedBy.fullName}
                      <span className="block text-xs text-muted-foreground">{formatDate(document.uploadedAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <RestoreButton vm={vm} document={document} />
                        <DownloadButton vm={vm} document={document} compact />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {vm.rows.map((document) => (
              <li key={document.id} className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
                <button type="button" onClick={() => vm.openDetail(document.id)} className="block text-left font-semibold [overflow-wrap:anywhere] hover:text-primary">
                  {document.title}
                </button>
                <p className="text-xs text-muted-foreground">
                  {document.owner.name} · {document.term?.name ?? 'Không gắn nhiệm kỳ'}
                </p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {document.fileName} · {formatFileSize(document.fileSize)}
                  {document.currentVersion > 1 && ` · Bản ${document.currentVersion}`} · {document.uploadedBy.fullName}, {formatDate(document.uploadedAt)}
                </p>
                <HiddenNote document={document} />
                <div className="flex flex-wrap gap-2">
                  <DownloadButton vm={vm} document={document} />
                  <RestoreButton vm={vm} document={document} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={vm.page} totalPages={vm.totalPages} totalElements={vm.totalElements} pageSize={vm.pageSize} onPageChange={vm.setPage} />
        </>
      )}

      {vm.canUpload && <UploadDocumentSheet clubId={vm.clubId} scopes={vm.scopes} open={vm.uploadOpen} onOpenChange={vm.setUploadOpen} />}
      <DocumentDetailSheet vm={vm} />
      <UploadVersionDialog clubId={vm.clubId} document={vm.detail} open={vm.versionOpen} onOpenChange={vm.setVersionOpen} />
      <ReasonDialog
        open={vm.hideTarget !== null}
        onOpenChange={(open) => !open && vm.setHideTarget(null)}
        title="Ẩn tài liệu"
        description={vm.hideTarget ? `“${vm.hideTarget.title}” sẽ biến khỏi danh sách của mọi người. Không có gì bị xóa; ban chủ nhiệm xem và khôi phục được.` : undefined}
        label="Lý do ẩn"
        confirmLabel="Ẩn tài liệu"
        pending={vm.hiding}
        onConfirm={vm.hide}
      />
      <ConfirmDialog
        open={vm.restoreTarget !== null}
        onOpenChange={(open) => !open && vm.setRestoreTarget(null)}
        title="Khôi phục tài liệu"
        description={vm.restoreTarget ? `“${vm.restoreTarget.title}” hiện lại với những người được xem như trước khi ẩn.` : undefined}
        confirmLabel="Khôi phục"
        pending={vm.restoring}
        onConfirm={vm.restore}
      />
    </div>
  )
}

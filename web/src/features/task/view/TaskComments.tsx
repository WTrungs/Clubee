import { Download, EyeOff, MessagesSquare } from 'lucide-react'
import type { FileRef } from '@/api/commonTypes'
import { formatDateTime } from '@/shared/format/formatDate'
import { formatFileSize } from '@/shared/lib/validateUploadFile'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { FileInput } from '@/shared/ui/FileInput'
import { FormAlert } from '@/shared/ui/FormAlert'
import { FormField } from '@/shared/ui/FormField'
import { Textarea } from '@/shared/ui/Input'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ErrorState } from '@/shared/ui/StateViews'
import type { TaskDetail } from '../model/taskTypes'
import { useTaskAttachmentDownload, useTaskCommentsViewModel } from '../viewModel/useTaskCommentsViewModel'

/** Danh sách tệp của việc, mỗi tệp là nút tải về. */
export function TaskFileList({ files, clubId, taskId }: { files: FileRef[]; clubId: string; taskId: string }) {
  const vm = useTaskAttachmentDownload(clubId, taskId)
  return (
    <ul className="space-y-1.5">
      {files.map((file) => (
        <li key={file.id}>
          <button
            type="button"
            onClick={() => vm.download(file)}
            disabled={vm.downloadingId === file.id}
            aria-label={`Tải ${file.name}`}
            className="flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:border-primary/40 disabled:opacity-60"
          >
            <Download aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** FR-TASK-07: bình luận của việc; bình luận bị ẩn chỉ còn dòng ghi ai ẩn, lúc nào. */
export function TaskComments({ task }: { task: TaskDetail }) {
  const vm = useTaskCommentsViewModel(task)
  return (
    <section aria-labelledby="task-comments" className="space-y-3">
      <h3 id="task-comments" className="flex items-center gap-2 text-sm font-bold">
        <MessagesSquare aria-hidden className="size-4 text-muted-foreground" />
        Bình luận ({vm.comments.length})
      </h3>
      {vm.error ? (
        <ErrorState error={vm.error} onRetry={vm.retry} />
      ) : vm.loading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : (
        <ul className="space-y-3" aria-label="Danh sách bình luận">
          {vm.comments.length === 0 && <li className="text-sm text-muted-foreground">Chưa có bình luận.</li>}
          {vm.comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar name={comment.author.fullName} size="sm" />
              <div className="min-w-0 flex-1 space-y-1.5 rounded-xl bg-muted/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{comment.author.fullName}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                  {comment.allowedActions.includes('HIDE') && (
                    <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => vm.setHiding(comment)} aria-label={`Ẩn bình luận của ${comment.author.fullName}`}>
                      <EyeOff aria-hidden />
                      Ẩn
                    </Button>
                  )}
                </div>
                {comment.hidden ? (
                  <p className="text-sm text-muted-foreground italic">
                    Bình luận đã được {comment.hidden.by.fullName} ẩn lúc {formatDateTime(comment.hidden.at)}.
                  </p>
                ) : (
                  <>
                    <p className="text-sm break-words whitespace-pre-line">{comment.body}</p>
                    {comment.attachments.length > 0 && <TaskFileList files={comment.attachments} clubId={task.clubId} taskId={task.id} />}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {vm.canComment && (
        <form
          noValidate
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            vm.submit()
          }}
        >
          <FormField label="Viết bình luận" error={vm.bodyError}>
            <Textarea rows={3} value={vm.body} onChange={(event) => vm.setBody(event.target.value)} maxLength={vm.bodyMax} placeholder="Trao đổi tiến độ, gửi tệp liên quan…" />
          </FormField>
          <FileInput files={vm.files} onChange={vm.setFiles} disabled={vm.sending} />
          <FormAlert message={vm.sendError} />
          <Button type="submit" size="sm" loading={vm.sending}>
            Gửi bình luận
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={vm.hiding !== null}
        onOpenChange={(open) => !open && vm.setHiding(null)}
        title="Ẩn bình luận?"
        description="Nội dung và tệp đính kèm sẽ không còn hiện với ai; dữ liệu vẫn được lưu."
        confirmLabel="Ẩn bình luận"
        pending={vm.hidePending}
        onConfirm={vm.confirmHide}
      />
    </section>
  )
}

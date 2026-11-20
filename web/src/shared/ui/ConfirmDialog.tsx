import type { ReactNode } from 'react'
import { Button } from './Button'
import { Dialog, DialogContent } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel: string
  confirmVariant?: 'primary' | 'destructive'
  pending?: boolean
  onConfirm: () => void
}

/** Xác nhận thao tác khó hoàn tác; không đóng được khi đang chờ máy chủ (NFR-REL-01). */
export function ConfirmDialog({ open, onOpenChange, title, description, children, confirmLabel, confirmVariant = 'primary', pending = false, onConfirm }: ConfirmDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (!pending) onOpenChange(next)
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
              Hủy bỏ
            </Button>
            <Button variant={confirmVariant} loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

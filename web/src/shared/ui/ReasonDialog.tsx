import { useId, useRef, useState, type ReactNode } from 'react'
import { REASON_MAX, REASON_MIN } from '@/shared/lib/reasonRules'
import { Button } from './Button'
import { Dialog, DialogContent } from './Dialog'
import { FormField } from './FormField'
import { Textarea } from './Input'

interface ReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  label?: string
  placeholder?: string
  confirmLabel: string
  confirmVariant?: 'primary' | 'destructive'
  /** Chuyển trạng thái bắt buộc lý do thì form bắt buộc nhập (SRS 4.2). */
  minLength?: number
  maxLength?: number
  pending?: boolean
  onConfirm: (reason: string) => void
}

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Lý do',
  placeholder,
  confirmLabel,
  confirmVariant = 'primary',
  minLength = REASON_MIN,
  maxLength = REASON_MAX,
  pending = false,
  onConfirm,
}: ReasonDialogProps) {
  const formId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReason('')
      setTouched(false)
    }
  }
  const trimmed = reason.trim()
  const error = touched && trimmed.length < minLength ? `Vui lòng nhập ít nhất ${minLength} ký tự.` : undefined

  const handleOpenChange = (next: boolean) => {
    if (pending) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={title}
        description={description}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          textareaRef.current?.focus()
        }}
        footer={
          <>
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
              Hủy bỏ
            </Button>
            <Button type="submit" form={formId} variant={confirmVariant} loading={pending}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTouched(true)
            if (trimmed.length >= minLength) onConfirm(trimmed)
          }}
        >
          <FormField label={label} required error={error}>
            <Textarea
              ref={textareaRef}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={placeholder}
              maxLength={maxLength}
            />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}

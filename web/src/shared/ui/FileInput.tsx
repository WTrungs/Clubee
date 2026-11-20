import { AnimatePresence, motion } from 'motion/react'
import { FileText, Paperclip, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { formatFileSize, UPLOAD_ACCEPT, UPLOAD_HINT, validateUploadFile } from '@/shared/lib/validateUploadFile'
import { Button } from './Button'

interface FileInputProps {
  files: File[]
  onChange: (files: File[]) => void
  maxFiles?: number
  disabled?: boolean
  label?: string
}

/** Chọn tệp đính kèm; kiểm tra định dạng và dung lượng ngay ở client (IF-05). */
export function FileInput({ files, onChange, maxFiles = 5, disabled, label = 'Đính kèm tệp' }: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const [errors, setErrors] = useState<string[]>([])

  const handleSelect = (selected: FileList | null) => {
    if (!selected) return
    const nextErrors: string[] = []
    const accepted: File[] = []
    for (const file of Array.from(selected)) {
      const result = validateUploadFile(file)
      if (result.ok) accepted.push(file)
      else nextErrors.push(result.message)
    }
    const room = maxFiles - files.length
    if (accepted.length > room) nextErrors.push(`Chỉ đính kèm tối đa ${maxFiles} tệp.`)
    setErrors(nextErrors)
    onChange([...files, ...accepted.slice(0, Math.max(room, 0))])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => handleSelect(event.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || files.length >= maxFiles}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden />
        {label}
      </Button>
      <p id={hintId} className="text-xs text-muted-foreground">
        {UPLOAD_HINT}.
      </p>
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-xs font-medium text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {files.map((file, index) => (
            <motion.li
              key={`${file.name}-${file.size}-${index}`}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="flex items-center gap-2 rounded-lg border bg-muted/50 py-1.5 pr-1 pl-2.5 text-sm"
            >
              <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                aria-label={`Bỏ tệp ${file.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X aria-hidden />
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

interface FieldControlProps {
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

interface FormFieldProps {
  label: ReactNode
  /** Một control duy nhất (Input, Textarea, NativeSelect...); FormField gắn id và thuộc tính aria cho nó. */
  children: ReactElement<FieldControlProps>
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  labelAside?: ReactNode
}

export function FormField({ label, children, hint, error, required, className, labelAside }: FormFieldProps) {
  const generatedId = useId()
  const controlId = (isValidElement(children) && children.props.id) || generatedId
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = cloneElement(children, {
    id: controlId,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
  })

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={controlId} className="text-sm font-semibold text-foreground">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-destructive">
              *
            </span>
          )}
        </label>
        {labelAside}
      </div>
      {control}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-1.5 text-xs font-medium text-destructive"
          >
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

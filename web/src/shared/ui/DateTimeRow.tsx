import type { UseFormRegisterReturn } from 'react-hook-form'
import { FormField } from './FormField'
import { Input } from './Input'

interface DateTimeRowProps {
  label: string
  date: UseFormRegisterReturn
  time: UseFormRegisterReturn
  error?: string
  required?: boolean
}

/** Ô ngày dd/mm/yyyy và ô giờ hh:mm cạnh nhau (NFR-USA-03). */
export function DateTimeRow({ label, date, time, error, required = true }: DateTimeRowProps) {
  return (
    <div className="grid grid-cols-[1fr_7rem] gap-3">
      <FormField label={label} required={required} error={error}>
        <Input inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10} {...date} />
      </FormField>
      <FormField
        label={
          <>
            Giờ<span className="sr-only"> {label.toLowerCase()}</span>
          </>
        }
        required={required}
      >
        <Input inputMode="numeric" placeholder="hh:mm" maxLength={5} {...time} />
      </FormField>
    </div>
  )
}

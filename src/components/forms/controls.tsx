import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Search, Upload } from 'lucide-react'
import { parseCentavos, displayCentavos } from '@/lib/utils/currency'
export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="form-field">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
export function SearchInput({
  value,
  onChange,
  label = 'Search',
  placeholder = 'Search…',
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="search-control">
      <Search size={17} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      {children}
      {onReset && (
        <button className="text-button" onClick={onReset} type="button">
          Reset filters
        </button>
      )}
    </div>
  )
}
export function CurrencyInput({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string
  value: string
  onChange: (centavos: string) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  return (
    <div className="currency-control">
      <span aria-hidden="true">₱</span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft ?? displayCentavos(value)}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-hint ${id}-error` : `${id}-hint`}
        onFocus={() => setDraft(displayCentavos(value))}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          const parsed = parseCentavos(next)
          setInvalid(parsed === null)
          if (parsed !== null) onChange(parsed)
        }}
        onBlur={() => {
          setDraft(null)
          setInvalid(false)
        }}
      />
      {invalid && (
        <span id={`${id}-error`} className="error">
          Enter a positive amount with up to two decimal places.
        </span>
      )}
    </div>
  )
}
export function DateTimePicker({
  id,
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Input
      {...props}
      id={id}
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-describedby={`${id}-hint`}
    />
  )
}
export function FileUploader({
  id,
  onFiles,
  accept = ['image/png', 'image/jpeg', 'application/pdf'],
  maxBytes = 5 * 1024 * 1024,
}: {
  id: string
  onFiles: (files: File[]) => void
  accept?: string[]
  maxBytes?: number
}) {
  const [error, setError] = useState('')
  const [names, setNames] = useState<string[]>([])
  return (
    <div className="file-uploader">
      <Upload size={20} aria-hidden="true" />
      <label htmlFor={id}>Choose files</label>
      <Input
        id={id}
        type="file"
        multiple
        accept={accept.join(',')}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.some((file) => file.size > maxBytes || !accept.includes(file.type))) {
            setError(
              `Choose an accepted file type, up to ${Math.floor(maxBytes / 1024 / 1024)} MB per file.`,
            )
            setNames([])
            onFiles([])
            e.target.value = ''
            return
          }
          setError('')
          setNames(files.map((f) => f.name))
          onFiles(files)
        }}
      />
      <p className="field-hint" id={`${id}-hint`}>
        {accept.join(', ')} · Up to {Math.floor(maxBytes / 1024 / 1024)} MB each. Selection only;
        files are not uploaded.
      </p>
      {names.length > 0 && (
        <ul aria-label="Selected files">
          {names.map((name, i) => (
            <li key={`${name}-${i}`}>{name}</li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}

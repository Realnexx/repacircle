import { useId, useState } from 'react'
import type { FieldDefinition } from './config'
import { displayCentavos, parseCentavos } from '@/lib/utils/currency'
import { repaFileUrl, uploadRepaFile } from './service'
import { Button } from '@/components/ui/button'
export type RenderField = Omit<FieldDefinition, 'category' | 'children'> & {
  category?: FieldDefinition['category']
  hint?: string
  when?: (values: Record<string, unknown>) => boolean
  children?: RenderField[]
}
export type FormFileStorage = {
  upload: (file: File, image: boolean) => Promise<string>
  url: (path: string) => Promise<string>
}
export function getPath(values: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
      values,
    )
}
export function setPath(
  values: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const copy = structuredClone(values)
  const keys = path.split('.')
  let cursor = copy
  for (const k of keys.slice(0, -1)) {
    if (!cursor[k] || typeof cursor[k] !== 'object') cursor[k] = {}
    cursor = cursor[k] as Record<string, unknown>
  }
  cursor[keys.at(-1)!] = value
  return copy
}
export function SchemaForm({
  fields,
  values,
  onChange,
  groupId,
  errors = {},
  fileStorage,
}: {
  fields: readonly RenderField[]
  values: Record<string, unknown>
  onChange: (path: string, value: unknown) => void
  groupId?: string
  errors?: Record<string, string>
  fileStorage?: FormFileStorage
}) {
  return (
    <div className="repa-fields">
      {fields.map((f) => (
        <Field
          key={f.key}
          field={f}
          values={values}
          change={onChange}
          groupId={groupId}
          error={errors[f.key]}
          fileStorage={fileStorage}
        />
      ))}
    </div>
  )
}
function Field({
  field: f,
  values,
  change,
  groupId,
  error,
  fileStorage,
}: {
  field: RenderField
  values: Record<string, unknown>
  change: (path: string, value: unknown) => void
  groupId?: string
  error?: string
  fileStorage?: FormFileStorage
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState('')
  const v = getPath(values, f.key)
  if (
    (f.when && !f.when(values)) ||
    (f.condition && getPath(values, f.condition.key) !== f.condition.equals)
  )
    return null
  const shared = {
    id,
    'aria-invalid': Boolean(error || fileError),
    'aria-describedby': error || fileError ? id + '-error' : f.hint ? id + '-hint' : undefined,
  }
  const save = (val: unknown) => change(f.key, val)
  let control
  if (f.type === 'checkbox')
    control = (
      <input
        {...shared}
        type="checkbox"
        checked={v === true}
        onChange={(e) => save(e.target.checked)}
      />
    )
  else if (f.type === 'textarea')
    control = (
      <textarea
        {...shared}
        rows={4}
        minLength={f.min}
        maxLength={f.max ?? 10000}
        value={String(v ?? '')}
        onChange={(e) => save(e.target.value)}
      />
    )
  else if (f.type === 'select')
    control = (
      <select {...shared} value={String(v ?? '')} onChange={(e) => save(e.target.value)}>
        <option value="">Select an option</option>
        {f.options?.map((o) => (
          <option key={o} value={o}>
            {o.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    )
  else if (f.type === 'multi_select' || f.type === 'radio')
    control = (
      <fieldset {...shared}>
        <legend>{f.label}</legend>
        {f.options?.map((o) => (
          <label className="checkbox-label" key={o}>
            <input
              type={f.type === 'radio' ? 'radio' : 'checkbox'}
              name={id}
              checked={f.type === 'radio' ? v === o : Array.isArray(v) && v.includes(o)}
              onChange={(e) =>
                save(
                  f.type === 'radio'
                    ? o
                    : e.target.checked
                      ? [...(Array.isArray(v) ? v : []), o]
                      : (Array.isArray(v) ? v : []).filter((x) => x !== o),
                )
              }
            />
            {o.replaceAll('_', ' ')}
          </label>
        ))}
      </fieldset>
    )
  else if (f.type === 'repeating') {
    const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : []
    control = (
      <fieldset>
        <legend>{f.label}</legend>
        {rows.map((row, i) => (
          <div className="repa-repeat-row" key={i}>
            <SchemaForm
              fields={f.children ?? []}
              values={row}
              groupId={groupId}
              fileStorage={fileStorage}
              onChange={(path, val) =>
                save(rows.map((r, n) => (n === i ? setPath(r, path, val) : r)))
              }
            />
            <Button variant="ghost" onClick={() => save(rows.filter((_, n) => n !== i))}>
              Remove row {i + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          disabled={rows.length >= (f.max ?? 20)}
          onClick={() => save([...rows, {}])}
        >
          Add {f.label.toLowerCase()} row
        </Button>
      </fieldset>
    )
  } else if (f.type === 'file' || f.type === 'image')
    control = (
      <div>
        <input
          {...shared}
          type="file"
          disabled={(!groupId && !fileStorage) || busy}
          accept={
            f.type === 'image'
              ? 'image/png,image/jpeg,image/webp'
              : 'image/png,image/jpeg,image/webp,application/pdf,text/plain'
          }
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file || (!groupId && !fileStorage)) return
            setBusy(true)
            setFileError('')
            try {
              save(
                await (fileStorage
                  ? fileStorage.upload(file, f.type === 'image')
                  : uploadRepaFile(groupId!, file, f.type === 'image')),
              )
            } catch (err) {
              setFileError(err instanceof Error ? err.message : 'Upload failed.')
            } finally {
              setBusy(false)
              e.target.value = ''
            }
          }}
        />
        {!groupId && !fileStorage && (
          <p className="field-hint">Save the draft once to enable private uploads.</p>
        )}
        {busy && <p role="status">Uploading…</p>}
        {typeof v === 'string' && v && (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                window.open(
                  await (fileStorage ? fileStorage.url(v) : repaFileUrl(v)),
                  '_blank',
                  'noopener,noreferrer',
                )
              } catch (err) {
                setFileError(err instanceof Error ? err.message : 'Preview failed.')
              }
            }}
          >
            View uploaded {f.type}
          </Button>
        )}
        {fileError && (
          <p role="alert" className="error">
            {fileError}
          </p>
        )}
      </div>
    )
  else if (f.type === 'currency')
    control = (
      <input
        {...shared}
        inputMode="decimal"
        defaultValue={typeof v === 'number' ? displayCentavos(String(v)) : ''}
        key={String(v)}
        onBlur={(e) => {
          if (!f.required && e.target.value.trim() === '') {
            setFileError('')
            save(null)
            return
          }
          const cents = parseCentavos(e.target.value)
          if (
            cents !== null &&
            BigInt(cents) <= BigInt(Math.floor(f.max ?? 1_000_000_000)) &&
            Number(cents) >= (f.min ?? 0)
          ) {
            setFileError('')
            save(Number(cents))
          } else {
            save(undefined)
            setFileError(
              'Enter a valid amount within the field limits, with up to two decimal places.',
            )
          }
        }}
      />
    )
  else
    control = (
      <input
        {...shared}
        type={
          f.type === 'number'
            ? 'number'
            : f.type === 'date'
              ? 'date'
              : f.type === 'time'
                ? 'time'
                : 'text'
        }
        value={typeof v === 'number' || typeof v === 'string' ? v : ''}
        min={f.type === 'number' ? f.min : undefined}
        max={f.type === 'number' ? f.max : undefined}
        minLength={f.type === 'text' ? f.min : undefined}
        maxLength={f.type === 'text' ? (f.max ?? 4000) : undefined}
        onChange={(e) =>
          save(
            f.type === 'number'
              ? e.target.value === ''
                ? undefined
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    )
  const grouped = ['radio', 'multi_select', 'repeating'].includes(f.type)
  return (
    <div className={`form-field${grouped ? ' repa-field-wide' : ''}`}>
      <label
        className={f.type === 'checkbox' ? 'checkbox-label' : undefined}
        htmlFor={grouped ? undefined : id}
      >
        {f.type === 'checkbox' ? (
          <>
            {control}
            {f.label}
          </>
        ) : !grouped ? (
          <>
            {f.label}
            {f.required ? ' *' : ''}
          </>
        ) : null}
      </label>
      {f.type !== 'checkbox' && control}
      {f.hint && (
        <p className="field-hint" id={id + '-hint'}>
          {f.hint}
        </p>
      )}
      {(error || fileError) && (
        <p className="error" role="alert" id={id + '-error'}>
          {error || fileError}
        </p>
      )}
    </div>
  )
}

import type { FieldDefinition } from './config'
import { fieldTypes } from './config'
import { Button } from '@/components/ui/button'
function newField(category: FieldDefinition['category']): FieldDefinition {
  return {
    key: 'custom_f' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
    label: 'New field',
    type: 'text',
    required: false,
    category,
  }
}
export function FieldDesigner({
  fields,
  category,
  onChange,
  depth = 0,
}: {
  fields: FieldDefinition[]
  category: FieldDefinition['category']
  onChange: (fields: FieldDefinition[]) => void
  depth?: number
}) {
  const update = (index: number, values: Partial<FieldDefinition>) =>
    onChange(fields.map((f, i) => (i === index ? { ...f, ...values } : f)))
  return (
    <section className="repa-designer">
      <h3>{depth ? 'Repeating row fields' : `Custom ${category} fields`}</h3>
      <p className="field-hint">
        Custom keys are namespaced with custom_. Financial fields, schedules, roles and status
        cannot be overridden. Currency minimums and maximums use minor units (100 = 1.00).
      </p>
      {fields.map((f, i) => (
        <fieldset key={i}>
          <legend>
            {f.label || 'Custom field'} <span className="muted">{i + 1}</span>
          </legend>
          <div className="personal-fields">
            <label>
              Field key
              <input
                value={f.key}
                maxLength={47}
                onChange={(e) => update(i, { key: e.target.value })}
              />
            </label>
            <label>
              Label
              <input
                value={f.label}
                maxLength={100}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </label>
            <label>
              Field type
              <select
                value={f.type}
                onChange={(e) => {
                  const type = e.target.value as FieldDefinition['type']
                  const copy = { ...f, type }
                  delete copy.children
                  if (type === 'repeating') copy.children = [newField(category)]
                  onChange(fields.map((old, n) => (n === i ? copy : old)))
                }}
              >
                {fieldTypes
                  .filter((t) => depth === 0 || t !== 'repeating')
                  .map((t) => (
                    <option value={t} key={t}>
                      {t.replaceAll('_', ' ')}
                    </option>
                  ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              Required
            </label>
            <label>
              Minimum (numeric value, text length, or item count)
              <input
                type="number"
                min={0}
                value={f.min ?? ''}
                onChange={(e) =>
                  update(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <label>
              Maximum
              <input
                type="number"
                min={0}
                value={f.max ?? ''}
                onChange={(e) =>
                  update(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            {['select', 'multi_select', 'radio'].includes(f.type) && (
              <label>
                Options (one per line)
                <textarea
                  value={f.options?.join('\n') ?? ''}
                  onChange={(e) =>
                    update(i, { options: e.target.value.split('\n').filter(Boolean) })
                  }
                />
              </label>
            )}
            <label>
              Show only when field equals
              <select
                value={f.condition?.key ?? ''}
                onChange={(e) =>
                  update(i, {
                    condition: e.target.value ? { key: e.target.value, equals: '' } : undefined,
                  })
                }
              >
                <option value="">Always visible</option>
                {fields
                  .filter((other) => other.key !== f.key && !other.condition)
                  .map((other) => (
                    <option key={other.key} value={other.key}>
                      {other.label}
                    </option>
                  ))}
              </select>
            </label>
            {f.condition && (
              <label>
                Equals value
                <input
                  value={String(f.condition.equals)}
                  onChange={(e) => {
                    const parent = fields.find((other) => other.key === f.condition?.key)
                    update(i, {
                      condition: {
                        key: f.condition!.key,
                        equals:
                          parent?.type === 'checkbox' ? e.target.value === 'true' : e.target.value,
                      },
                    })
                  }}
                  placeholder="For a checkbox: true or false"
                />
              </label>
            )}
          </div>
          {f.type === 'repeating' && (
            <FieldDesigner
              fields={f.children ?? []}
              category={category}
              depth={1}
              onChange={(children) => update(i, { children })}
            />
          )}
          <Button variant="ghost" onClick={() => onChange(fields.filter((_, n) => n !== i))}>
            Remove definition {i + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        disabled={fields.length >= (depth ? 10 : 30)}
        onClick={() => onChange([...fields, newField(category)])}
      >
        Add custom {depth ? 'row' : category} field
      </Button>
    </section>
  )
}

import { SchemaForm, type RenderField } from '@/modules/repa/schema-form'
import type { GroupConfig } from '@/modules/repa/config'
import { weekdayNames } from './engine'
import { Button } from '@/components/ui/button'
export function ContributionRuleFields({
  configuration: c,
  onChange,
}: {
  configuration: GroupConfig
  onChange: (path: string, value: unknown) => void
}) {
  const s = c.schedule,
    fee = c.contribution.late_fee_rule
  const enableFee = () =>
    onChange('contribution.late_fee_rule', {
      mode: 'fixed',
      fixed_minor: c.contribution.late_fee_minor,
      rate_basis_points: 0,
      cap_minor: c.contribution.late_fee_minor,
      review_reference: '',
      reviewed_by: '',
      reviewed_on: '',
      disclosure: '',
    })
  const feeFields: RenderField[] = [
    {
      key: 'mode',
      label: 'Reviewed late fee type',
      type: 'select',
      required: true,
      options: ['none', 'fixed', 'percentage'],
    },
    {
      key: 'fixed_minor',
      label: 'Fixed late fee',
      type: 'currency',
      required: true,
      min: 0,
      max: 1e9,
      when: (v) => v.mode === 'fixed',
    },
    {
      key: 'rate_basis_points',
      label: 'Late fee rate in basis points (100 = 1%)',
      type: 'number',
      required: true,
      min: 0,
      max: 10000,
      when: (v) => v.mode === 'percentage',
    },
    {
      key: 'cap_minor',
      label: 'Maximum late fee per obligation',
      type: 'currency',
      required: true,
      min: 0,
      max: 1e9,
    },
    {
      key: 'review_reference',
      label: 'Legal review reference',
      type: 'text',
      required: true,
      max: 500,
    },
    { key: 'reviewed_by', label: 'Legal reviewer', type: 'text', required: true, max: 200 },
    { key: 'reviewed_on', label: 'Legal review date', type: 'date', required: true },
    {
      key: 'disclosure',
      label: 'Member-facing late fee disclosure',
      type: 'textarea',
      required: true,
      min: 20,
      max: 4000,
    },
  ]
  return (
    <section className="component-spacing">
      <h3>Calendar rules</h3>
      {s.frequency === 'weekdays' && (
        <fieldset>
          <legend>Specific weekdays</legend>
          <div className="reward-type-options">
            {weekdayNames.map((name, i) => (
              <label className="checkbox-label" key={name}>
                <input
                  type="checkbox"
                  checked={s.weekdays?.includes(i + 1) ?? false}
                  onChange={(e) =>
                    onChange(
                      'schedule.weekdays',
                      e.target.checked
                        ? [...(s.weekdays ?? []), i + 1].sort((a, b) => a - b)
                        : (s.weekdays ?? []).filter((n) => n !== i + 1),
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {s.frequency === 'monthly_dates' && (
        <label>
          Specific monthly dates (comma separated)
          <input
            defaultValue={(s.monthly_dates ?? []).join(', ')}
            key={(s.monthly_dates ?? []).join(',')}
            onBlur={(e) =>
              onChange(
                'schedule.monthly_dates',
                e.target.value
                  .split(',')
                  .map((v) => Number(v.trim()))
                  .filter((v) => v > 0),
              )
            }
          />
          <small>
            Days 1–31. Dates that do not exist in a month are skipped. The monthly frequency keeps
            its original anchor and clamps month-end.
          </small>
        </label>
      )}
      {s.frequency === 'custom_dates' && (
        <label>
          Custom contribution dates
          <textarea
            defaultValue={(s.custom_dates ?? []).join('\n')}
            key={(s.custom_dates ?? []).join(',')}
            onBlur={(e) =>
              onChange(
                'schedule.custom_dates',
                e.target.value
                  .split('\n')
                  .map((v) => v.trim())
                  .filter(Boolean),
              )
            }
          />
          <small>
            One YYYY-MM-DD date per round, ascending and unique, on or after the start date.
          </small>
        </label>
      )}
      <p>
        Cutoffs use the explicitly stored timezone. Asia/Manila is the default. A grace period
        delays overdue status without changing the original due date.
      </p>
      {c.contribution.late_policy === 'fee' && (
        <>
          <h3>Reviewed fee terms</h3>
          <p>
            One non-compounding assessment per obligation, based on principal unpaid at grace
            expiry. Percentage calculations round up to the next minor unit and respect the
            disclosed maximum. Record the legal review before activation; no fee is assessed from
            unreviewed legacy terms.
          </p>
          {fee ? (
            <SchemaForm
              fields={feeFields}
              values={fee}
              onChange={(key, v) => onChange('contribution.late_fee_rule.' + key, v)}
            />
          ) : (
            <Button variant="secondary" onClick={enableFee}>
              Configure legally reviewed late fee
            </Button>
          )}
        </>
      )}
    </section>
  )
}

import type { ZodIssue } from 'zod'
import {
  configSchema,
  draftSchema,
  validateDynamic,
  type GroupConfig,
  type FieldDefinition,
} from './config'
import { stepFields } from './wizard-fields'
import type { RenderField } from './schema-form'

export type WizardIssue = { path: string; label: string; message: string; step: number }

function fieldInfo(path: string): { field?: RenderField; label: string; step: number } {
  const extraLabels: Record<string, string> = {
    'schedule.weekdays': 'Specific weekdays',
    'schedule.monthly_dates': 'Specific monthly dates',
    'schedule.custom_dates': 'Custom contribution dates',
    'contribution.late_fee_rule.fixed_minor': 'Fixed late fee',
    'contribution.late_fee_rule.rate_basis_points': 'Late fee rate',
    'contribution.late_fee_rule.cap_minor': 'Maximum late fee per obligation',
    'contribution.late_fee_rule.review_reference': 'Legal review reference',
    'contribution.late_fee_rule.reviewed_by': 'Legal reviewer',
    'contribution.late_fee_rule.reviewed_on': 'Legal review date',
    'contribution.late_fee_rule.disclosure': 'Member-facing late fee disclosure',
  }
  if (extraLabels[path]) return { label: extraLabels[path], step: 3 }
  for (const [step, fields] of Object.entries(stepFields)) {
    for (const field of fields) {
      if (path === field.key) return { field, label: field.label, step: Number(step) }
      if (path.startsWith(field.key + '.')) {
        const [row, key] = path.slice(field.key.length + 1).split('.')
        const child = field.children?.find((f) => f.key === key)
        return {
          field: child ?? field,
          label: child ? `${field.label}, row ${Number(row) + 1}: ${child.label}` : field.label,
          step: Number(step),
        }
      }
    }
  }
  if (path.startsWith('schedule.')) return { label: 'Calendar rules', step: 3 }
  if (path.startsWith('contribution.')) return { label: 'Reviewed fee terms', step: 3 }
  if (path.startsWith('fields.'))
    return { label: 'Custom field definitions', step: path === 'fields.membership' ? 6 : 2 }
  return { label: 'Group configuration', step: 0 }
}

function readableMessage(issue: ZodIssue, field?: RenderField) {
  if (issue.code === 'custom') return issue.message
  if (issue.code === 'invalid_type') {
    if (field?.type === 'currency') return 'Enter a valid amount with up to two decimal places.'
    if (field?.type === 'number') return 'Enter a valid whole number.'
    return 'Complete this field with a valid value.'
  }
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    const limit = issue.code === 'too_small' ? issue.minimum : issue.maximum
    const bound = issue.code === 'too_small' ? 'at least' : 'at most'
    if (issue.origin === 'string') return `Use ${bound} ${limit} characters.`
    if (issue.origin === 'array') return `Choose ${bound} ${limit} items.`
    if (field?.type === 'currency')
      return `Enter an amount ${bound} ${(Number(limit) / 100).toFixed(2)}.`
    return `Enter a value ${bound} ${limit}.`
  }
  if (issue.code === 'invalid_value') return 'Choose a supported option.'
  if (issue.code === 'invalid_format')
    return field?.type === 'time' ? 'Enter a valid time.' : 'Enter a valid date or value.'
  return issue.message
}

// Presentation paths may differ from stored configuration paths (for example rotation order).
export function wizardIssues(
  c: GroupConfig,
  mode: 'draft' | 'activation' = 'activation',
): WizardIssue[] {
  const result: WizardIssue[] = []
  const parsed = (mode === 'draft' ? draftSchema : configSchema).safeParse(c)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      let path = issue.path.join('.')
      if (
        path === 'contribution.late_fee_rule' &&
        issue.code === 'custom' &&
        c.contribution.late_fee_rule
      ) {
        const fee = c.contribution.late_fee_rule
        const problems: [string, boolean, string][] = [
          [
            'fixed_minor',
            fee.mode === 'fixed' && !fee.fixed_minor,
            'Enter a positive fixed late fee.',
          ],
          [
            'rate_basis_points',
            fee.mode === 'percentage' && !fee.rate_basis_points,
            'Enter a positive late fee rate.',
          ],
          ['cap_minor', !fee.cap_minor, 'Enter a positive maximum late fee.'],
          [
            'review_reference',
            fee.review_reference.length < 3,
            'Enter a legal review reference of at least 3 characters.',
          ],
          [
            'reviewed_by',
            fee.reviewed_by.length < 2,
            'Enter the legal reviewer’s name (at least 2 characters).',
          ],
          [
            'reviewed_on',
            !/^\d{4}-\d{2}-\d{2}$/.test(fee.reviewed_on) ||
              !Number.isFinite(Date.parse(fee.reviewed_on)) ||
              new Date(fee.reviewed_on).toISOString().slice(0, 10) !== fee.reviewed_on ||
              fee.reviewed_on > new Date().toISOString().slice(0, 10),
            'Enter a valid legal review date that is today or earlier.',
          ],
          [
            'disclosure',
            fee.disclosure.length < 20,
            'Disclose the late fee terms using at least 20 characters.',
          ],
        ]
        for (const [key, invalid, message] of problems) {
          if (!invalid) continue
          const path = 'contribution.late_fee_rule.' + key
          result.push({ path, label: fieldInfo(path).label, step: 3, message })
        }
        continue
      }
      if (path === 'reward.custom_values' && mode === 'activation') continue
      if (path.startsWith('distribution.rotation_order')) path = 'rotation_order_input'
      if (path.startsWith('fields')) {
        const category = c.fields[Number(issue.path[1])]?.category ?? 'reward'
        path = `fields.${category}`
      }
      if (path === 'contribution.late_fee_minor' && c.contribution.late_fee_rule)
        path = 'contribution.late_fee_rule.mode'
      if (
        path === 'schedule.frequency' &&
        ['weekdays', 'monthly_dates', 'custom_dates'].includes(c.schedule.frequency)
      )
        path = `schedule.${c.schedule.frequency}`
      // Array element errors belong to the calendar control that edits the entire list.
      if (/^schedule\.(weekdays|monthly_dates|custom_dates)\./.test(path))
        path = path.split('.').slice(0, 2).join('.')
      const info = fieldInfo(path)
      result.push({
        path,
        label: info.label,
        step: info.step,
        message: readableMessage(issue, info.field),
      })
    }
  }
  if (mode === 'activation') {
    const visit = (
      fields: FieldDefinition[],
      values: Record<string, unknown>,
      prefix: string,
      parentLabel = '',
    ) => {
      for (const field of fields) {
        if (field.condition && values[field.condition.key] !== field.condition.equals) continue
        const path = prefix + field.key
        const value = values[field.key]
        if (
          field.type === 'repeating' &&
          Array.isArray(value) &&
          value.length > 0 &&
          value.length <= (field.max ?? 20) &&
          value.length >= (field.min ?? 0)
        ) {
          value.forEach((row, index) => {
            if (row && typeof row === 'object' && !Array.isArray(row))
              visit(
                field.children ?? [],
                row,
                `${path}.${index}.`,
                `${parentLabel}${field.label}, row ${index + 1}: `,
              )
          })
        } else {
          for (const message of validateDynamic([{ ...field, condition: undefined }], {
            [field.key]: value,
          }))
            result.push({ path, label: parentLabel + field.label, step: 2, message })
        }
      }
    }
    visit(
      c.fields.filter((f) => f.category === 'reward'),
      c.reward.custom_values,
      'reward.custom_values.',
    )
  }
  // Keep all distinct messages for a field instead of silently overwriting an earlier issue.
  return result.filter(
    (issue, index) =>
      result.findIndex((other) => other.path === issue.path && other.message === issue.message) ===
      index,
  )
}

export function inlineErrors(issues: WizardIssue[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const { path, message } of issues)
    errors[path] = errors[path] ? errors[path] + ' ' + message : message
  return errors
}

import { describe, expect, it } from 'vitest'
import { defaultConfig } from './config'
import { inlineErrors, wizardIssues } from './validation'

const config = () => defaultConfig('10000000-0000-4000-8000-000000000001')
describe('REPA wizard validation feedback', () => {
  it('allows incomplete drafts while identifying activation requirements by step', () => {
    const c = config()
    expect(wizardIssues(c, 'draft')).toEqual([])
    expect(wizardIssues(c)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'basic.name', step: 0 }),
        expect.objectContaining({ path: 'contribution.amount_minor', step: 3 }),
        expect.objectContaining({ path: 'membership.terms', step: 6 }),
      ]),
    )
  })
  it('maps stored rotation and calendar paths to their actual editing controls', () => {
    const c = config()
    c.distribution.rotation_order = [1, 1]
    c.schedule.frequency = 'weekdays'
    c.schedule.weekdays = []
    expect(wizardIssues(c)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'rotation_order_input',
          step: 5,
          label: expect.stringContaining('Fixed rotation order'),
        }),
        expect.objectContaining({ path: 'schedule.weekdays', step: 3, label: 'Specific weekdays' }),
      ]),
    )
  })
  it('retains the row and child path for invalid member contributions', () => {
    const c = config()
    c.contribution.policy = 'configurable'
    c.contribution.member_amounts = [{ slot: 0, amount_minor: -1 }]
    expect(wizardIssues(c, 'draft')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'contribution.member_amounts.0.slot',
          label: 'Member contributions, row 1: Member slot',
          message: 'Enter a value at least 1.',
        }),
        expect.objectContaining({
          path: 'contribution.member_amounts.0.amount_minor',
          message: 'Enter an amount at least 0.00.',
        }),
      ]),
    )
  })
  it('points custom reward errors at visible nested fields and respects conditions', () => {
    const c = config()
    c.fields = [
      {
        key: 'custom_enabled',
        label: 'Enabled',
        type: 'checkbox',
        required: false,
        category: 'reward',
      },
      {
        key: 'custom_hidden',
        label: 'Hidden',
        type: 'text',
        required: true,
        category: 'reward',
        condition: { key: 'custom_enabled', equals: true },
      },
      {
        key: 'custom_items',
        label: 'Items',
        type: 'repeating',
        required: true,
        category: 'reward',
        children: [
          {
            key: 'custom_name',
            label: 'Item name',
            type: 'text',
            required: true,
            category: 'reward',
          },
        ],
      },
    ]
    c.reward.custom_values = { custom_enabled: false, custom_items: [{}] }
    const issues = wizardIssues(c)
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: 'reward.custom_values.custom_items.0.custom_name',
        message: 'Item name is required.',
      }),
    )
    expect(issues.some((i) => i.path.includes('custom_hidden'))).toBe(false)
  })
  it('places each incomplete legal review requirement beside its field', () => {
    const c = config()
    c.contribution.late_policy = 'fee'
    c.contribution.late_fee_rule = {
      mode: 'fixed',
      fixed_minor: 0,
      rate_basis_points: 0,
      cap_minor: 0,
      review_reference: '',
      reviewed_by: '',
      reviewed_on: '',
      disclosure: '',
    }
    const errors = inlineErrors(wizardIssues(c))
    expect(errors['contribution.late_fee_rule.review_reference']).toContain(
      'legal review reference',
    )
    expect(errors['contribution.late_fee_rule.reviewed_on']).toContain('valid legal review date')
    expect(errors['contribution.late_fee_rule.fixed_minor']).toContain('positive fixed late fee')
    expect(errors['contribution.late_fee_rule']).toBeUndefined()
  })
})

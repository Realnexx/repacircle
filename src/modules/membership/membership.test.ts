import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGroupJoinIntent, clearGroupJoinIntent, groupInvitationLink } from './intent'
import { pendingInvitationPath } from '@/modules/auth/invitation-intent'
import { policySchema, invitationSchema, allAcknowledgements, agreementSections } from './service'
import { invitationEmailHandler } from '../../../supabase/functions/_shared/invitation-email'
beforeEach(() => {
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})
describe('group membership contracts', () => {
  it('captures and removes link secrets before login and preserves a safe return path', () => {
    const id = '80000000-0000-4000-8000-000000000001'
    const token = 'a'.repeat(64)
    history.replaceState(null, '', `/groups/join#id=${id}&token=${token}`)
    expect(getGroupJoinIntent()).toEqual({ id, token })
    expect(location.hash).toBe('')
    history.replaceState(null, '', '/login')
    expect(pendingInvitationPath()).toBe('/groups/join')
    expect(groupInvitationLink(id, token)).toContain('/groups/join#')
    clearGroupJoinIntent()
    expect(pendingInvitationPath()).toBe('/organizations')
  })
  it('ignores malformed secrets and never treats an OAuth fragment as an invitation', () => {
    history.replaceState(null, '', '/groups/join#id=no&token=short')
    expect(getGroupJoinIntent()).toBeNull()
    history.replaceState(
      null,
      '',
      '/auth/callback#id=80000000-0000-4000-8000-000000000001&token=' + 'a'.repeat(64),
    )
    expect(getGroupJoinIntent()).toBeNull()
  })
  it('requires all ten policy acknowledgements and bounded complete enrollment policies', () => {
    const ack = allAcknowledgements()
    expect(Object.keys(ack)).toEqual(Object.keys(agreementSections))
    expect(Object.keys(ack)).toHaveLength(10)
    expect(Object.values(ack).every(Boolean)).toBe(true)
    expect(
      policySchema.safeParse({
        refund_exit_policy: 'Missing',
        dispute_process: '',
        privacy_notice: '',
      }).success,
    ).toBe(false)
    expect(invitationSchema.safeParse({ email: '', max_uses: 2, expires_hours: 168 }).success).toBe(
      true,
    )
    expect(
      invitationSchema.safeParse({ email: 'invalid', max_uses: 0, expires_hours: 169 }).success,
    ).toBe(false)
  })
  it('sends group links only to the server-resolved recipient', async () => {
    const send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const claim = vi.fn().mockResolvedValue({
      email: 'member@example.test',
      organization_name: 'Community',
      group_name: 'REPA circle',
    })
    const handler = invitationEmailHandler({
      kind: 'group',
      appUrl: 'https://repacircle.vercel.app',
      apiKey: 'test-only',
      from: 'sender@example.test',
      claim,
      send,
    })
    const response = await handler(
      new Request('https://edge.example.test', {
        method: 'POST',
        headers: { authorization: 'Bearer test-only', origin: 'https://repacircle.vercel.app' },
        body: JSON.stringify({
          invitation_id: '80000000-0000-4000-8000-000000000001',
          invitation_token: 'a'.repeat(64),
          email: 'attacker@example.test',
        }),
      }),
    )
    expect(response.status).toBe(200)
    const payload = JSON.parse(send.mock.calls[0][1].body)
    expect(payload.to).toEqual(['member@example.test'])
    expect(payload.text).toContain('/groups/join#')
    expect(payload.text).toContain('REPA circle')
    expect(payload.text).not.toContain('attacker@example.test')
  })
})

import { beforeEach, it, expect, vi } from 'vitest'
import { invitationEmailHandler } from '../../../supabase/functions/_shared/invitation-email'
const claim = vi.fn()
const send = vi.fn()
const token = 'a'.repeat(64)
const id = '20000000-0000-4000-8000-000000000001'
const handler = () =>
  invitationEmailHandler({
    appUrl: 'https://repacircle.vercel.app',
    apiKey: 'test-key',
    from: 'test@example.test',
    claim,
    send,
  })
function request(
  body: unknown = { invitation_id: id, invitation_token: token },
  authorization = 'Bearer test-jwt',
) {
  return new Request('https://edge.example.test', {
    method: 'POST',
    headers: { authorization, origin: 'https://repacircle.vercel.app' },
    body: JSON.stringify(body),
  })
}
beforeEach(() => {
  claim
    .mockReset()
    .mockResolvedValue({ email: 'invited@example.test', organization_name: 'Circle' })
  send.mockReset().mockResolvedValue(new Response('{}', { status: 200 }))
})
it('rejects missing credentials before sending', async () => {
  const response = await handler()(request({}, ''))
  expect(response.status).toBe(401)
  expect(claim).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})
it('rejects unauthorized or expired invitations', async () => {
  claim.mockRejectedValue(new Error('denied'))
  expect((await handler()(request())).status).toBe(403)
  expect(send).not.toHaveBeenCalled()
})
it('uses the server-resolved recipient and configured origin only', async () => {
  const response = await handler()(
    request({
      invitation_id: id,
      invitation_token: token,
      email: 'attacker@example.test',
      redirect: 'https://evil.test',
    }),
  )
  expect(response.status).toBe(200)
  const payload = JSON.parse(send.mock.calls[0][1].body)
  expect(payload.to).toEqual(['invited@example.test'])
  expect(payload.text).toContain('https://repacircle.vercel.app/invite#')
  expect(payload.text).not.toContain('evil.test')
  expect(await response.text()).not.toContain(token)
})
it('returns a recoverable error when the provider rejects delivery', async () => {
  send.mockResolvedValue(new Response('{}', { status: 503 }))
  expect((await handler()(request())).status).toBe(502)
})
it('rejects foreign origins and malformed tokens', async () => {
  expect(
    (
      await handler()(
        new Request('https://edge.example.test', {
          method: 'POST',
          headers: { origin: 'https://evil.test' },
        }),
      )
    ).status,
  ).toBe(403)
  expect((await handler()(request({ invitation_id: id, invitation_token: 'short' }))).status).toBe(
    400,
  )
})

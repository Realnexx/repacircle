export type DeliveryDependencies = {
  appUrl: string
  apiKey: string
  from: string
  claim: (
    authorization: string,
    id: string,
    token: string,
  ) => Promise<{ email: string; organization_name: string; group_name?: string }>
  kind?: 'organization' | 'group'
  send: typeof fetch
}
export function invitationEmailHandler(deps: DeliveryDependencies) {
  return async (request: Request): Promise<Response> => {
    let origin: string
    try {
      const configured = new URL(deps.appUrl)
      if (
        configured.protocol !== 'https:' &&
        !['localhost', '127.0.0.1'].includes(configured.hostname)
      )
        throw new Error('HTTPS required')
      origin = configured.origin
    } catch {
      return Response.json({ error: 'Email delivery is not configured.' }, { status: 503 })
    }
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
    }
    const reply = (body: unknown, status: number) => Response.json(body, { status, headers })
    if (request.headers.get('origin') && request.headers.get('origin') !== origin)
      return reply({ error: 'Origin not allowed.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization))
      return reply({ error: 'Authentication required.' }, 401)
    if (!deps.apiKey || !deps.from)
      return reply(
        { error: 'Email delivery is not configured. Copy the invitation link instead.' },
        503,
      )
    let id: string
    let token: string
    try {
      const text = await request.text()
      if (text.length > 4096) return reply({ error: 'Request too large.' }, 413)
      const body = JSON.parse(text)
      id = body.invitation_id
      token = body.invitation_token
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(token))
        throw new Error('Invalid request')
    } catch {
      return reply({ error: 'Invalid invitation request.' }, 400)
    }
    let invitation: { email: string; organization_name: string; group_name?: string }
    try {
      invitation = await deps.claim(authorization, id, token)
    } catch {
      return reply(
        { error: 'Invitation delivery is not authorized or the invitation is unavailable.' },
        403,
      )
    }
    const group = deps.kind === 'group'
    const link = `${origin}/${group ? 'groups/join' : 'invite'}#${new URLSearchParams({ id, token })}`
    try {
      const response = await deps.send('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${group ? 'group' : 'organization'}-invitation-${id}`,
        },
        body: JSON.stringify({
          from: deps.from,
          to: [invitation.email],
          subject: group
            ? 'Your RepaCircle group invitation'
            : 'Your RepaCircle organization invitation',
          text: group
            ? `You have been invited to ${invitation.group_name} in ${invitation.organization_name} on RepaCircle.\n\nSign in using this email address to request enrollment and review your group agreement:\n${link}\n\nThe invitation has a limited lifetime. Approval and full agreement acceptance are required before participation. An organization owner invitation may also create basic organization membership. If you did not expect this invitation, you can ignore it.`
            : `You have been invited to ${invitation.organization_name} on RepaCircle.\n\nSign in using this email address and accept your invitation:\n${link}\n\nThis invitation expires after seven days. Privileged roles require an authenticator. If you did not expect this invitation, you can ignore it.`,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok)
        return reply(
          {
            error:
              'Email provider did not accept delivery. Retry after one minute, or copy the link.',
          },
          502,
        )
      return reply({ sent: true }, 200)
    } catch {
      return reply(
        { error: 'Email delivery timed out. Retry after one minute, or copy the link.' },
        502,
      )
    }
  }
}

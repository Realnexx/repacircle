import { createClient } from '@supabase/supabase-js'
import { invitationEmailHandler } from '../_shared/invitation-email.ts'
Deno.serve(
  invitationEmailHandler({
    appUrl: Deno.env.get('APP_URL') ?? '',
    apiKey: Deno.env.get('RESEND_API_KEY') ?? '',
    from: Deno.env.get('RESEND_FROM_EMAIL') ?? '',
    send: fetch,
    claim: async (authorization, id, token) => {
      const client = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      )
      const {
        data: { user },
        error,
      } = await client.auth.getUser(authorization.replace(/^Bearer /i, ''))
      if (error || !user?.email_confirmed_at) throw new Error('Authentication required')
      const result = await client.rpc('claim_invitation_delivery', {
        invitation_id: id,
        invitation_token: token,
      })
      if (result.error) throw result.error
      return result.data as { email: string; organization_name: string }
    },
  }),
)

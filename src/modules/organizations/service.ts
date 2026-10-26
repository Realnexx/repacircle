import { z } from 'zod'
import { supabase } from '../../lib/supabase'
export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters.')
    .max(80, 'Use 80 characters or fewer.'),
})
export type Organization = { id: string; name: string; created_at: string }
export async function listOrganizations(): Promise<Organization[]> {
  if (!supabase) throw new Error('Connect Supabase to continue.')
  const { data, error } = await supabase
    .from('organizations')
    .select('id,name,created_at')
    .order('created_at')
  if (error) throw error
  return data
}
export async function createOrganization(
  input: z.infer<typeof organizationSchema>,
  requestId: string,
) {
  if (!supabase) throw new Error('Connect Supabase to continue.')
  const { data, error } = await supabase.rpc('create_organization', {
    organization_name: organizationSchema.parse(input).name,
    request_id: requestId,
  })
  if (error) throw error
  return data as string
}

import { z } from 'zod'
import { requireClient, command } from '@/lib/api/client'
import { personalSchema } from './personal'
export const profileInputSchema = z
  .object({
    full_name: z.string().trim().max(170),
    mobile_number: z
      .string()
      .trim()
      .max(30)
      .refine(
        (v) => /^(09\d{9}|\+639\d{9})$/.test(v.replace(/[\s()-]/g, '')),
        'Enter a Philippine mobile number (09… or +639…).',
      ),
    address: z.string().trim().max(600),
    notification_settings: z.object({ email: z.boolean(), push: z.boolean() }),
  })
  .extend(personalSchema.shape)
export type ProfileInput = z.infer<typeof profileInputSchema>
export type Profile = Omit<ProfileInput, 'address'> & {
  id: string
  email: string
  address: string | null
  avatar_path: string | null
  account_status: 'active' | 'suspended'
  created_at: string
  updated_at: string
  profile_completed_at: string | null
}
export async function getMyProfile(id: string) {
  const { data, error } = await requireClient().from('profiles').select('*').eq('id', id).single()
  if (error) throw error
  return data as Profile
}
export async function updateMyProfile(input: ProfileInput, avatarPath: string | null) {
  const values = profileInputSchema.parse(input)
  await command('save_personal_profile', { details: { ...values, avatar_path: avatarPath } })
}
export function isProfileComplete(profile: Partial<Profile> | null | undefined) {
  return Boolean(profile?.profile_completed_at && profileInputSchema.safeParse(profile).success)
}

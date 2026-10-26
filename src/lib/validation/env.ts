import { z } from 'zod'
const schema = z.object({
  VITE_SUPABASE_URL: z
    .url()
    .refine(
      (value) =>
        value.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value),
      'Use HTTPS or a local Supabase URL.',
    ),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'A Supabase publishable key is required.'),
})
export function validateEnvironment(input: Record<string, unknown>) {
  const url = input.VITE_SUPABASE_URL
  const key = input.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url && !key) return { config: null, error: null, mode: 'setup' as const }
  const result = schema.safeParse(input)
  if (!result.success)
    return {
      config: null,
      error:
        'Supabase configuration is incomplete or invalid. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.',
      mode: 'invalid' as const,
    }
  return { config: result.data, error: null, mode: 'connected' as const }
}
export const environment = validateEnvironment(import.meta.env)
export const googleOAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_OAUTH !== 'false'

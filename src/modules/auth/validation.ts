import { z } from 'zod'
export const emailSchema = z.email('Enter a valid email address.').max(254)
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use 128 characters or fewer.')
export const registrationSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: emailSchema,
  password: passwordSchema,
})

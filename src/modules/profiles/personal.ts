import { z } from 'zod'

const name = z.string().trim().min(1, 'This field is required.').max(50)
const code = z.string().regex(/^\d{9}$/, 'Select a PSGC location.')
export const personalSchema = z.object({
  first_name: name,
  middle_name: z.string().trim().max(50),
  last_name: name,
  extension_name: z.string().trim().max(10),
  gender: z.enum(['female', 'male', 'non_binary', 'self_described', 'prefer_not_to_say']),
  region_code: code,
  region_name: z.string().trim().min(1).max(100),
  province_code: z.union([code, z.literal('')]),
  province_name: z.string().trim().max(100),
  city_code: code,
  city_name: z.string().trim().min(1).max(100),
  barangay_code: code,
  barangay_name: z.string().trim().min(1).max(100),
  street_address: z
    .string()
    .trim()
    .min(2, 'Enter your house/building and street or purok.')
    .max(150),
  postal_code: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, 'Enter a four-digit postal code.'),
})
export type PersonalInput = z.infer<typeof personalSchema>
export const emptyPersonal: PersonalInput = {
  first_name: '',
  middle_name: '',
  last_name: '',
  extension_name: '',
  gender: 'prefer_not_to_say',
  region_code: '',
  region_name: '',
  province_code: '',
  province_name: '',
  city_code: '',
  city_name: '',
  barangay_code: '',
  barangay_name: '',
  street_address: '',
  postal_code: '',
}

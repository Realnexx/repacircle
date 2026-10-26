import { z } from 'zod'
const locationsSchema = z.array(
  z.object({
    code: z.string().regex(/^\d{9}$/),
    name: z.string(),
    provinceCode: z.union([z.string(), z.literal(false)]).optional(),
  }),
)
export type Location = z.infer<typeof locationsSchema>[number]
export async function getLocations(path: string, signal?: AbortSignal): Promise<Location[]> {
  const response = await fetch(`https://psgc.gitlab.io/api/${path}/`, { signal })
  if (!response.ok) throw new Error('PSGC addresses could not be loaded. Please retry.')
  return locationsSchema.parse(await response.json()).sort((a, b) => a.name.localeCompare(b.name))
}
